// Etiqueta oficial da Shopee em PDF (é o código de barras dela que a coleta ou a agência lê).
// A Shopee só gera a etiqueta depois que o envio é organizado (pedido PROCESSED). Com ?organizar=1, e se
// a loja puder postar numa agência sem escolher nada, o Plist organiza o envio por postagem antes.
// Coleta (pickup) pede endereço e horário: isso o lojista escolhe no Seller Centre.
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { pedidos } from "@/db/schema";
import { contaDaSessao } from "@/lib/sessao";
import { baixarShopee, chamarShopee, ErroShopee, lojaValida } from "@/lib/shopee";

type Loja = { accessToken: string; shopId: number };
type Resultado<T> = { response?: { result_list?: (T & { order_sn: string; fail_error?: string })[] } };

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rastreio(loja: Loja, sn: string): Promise<string> {
  const r = await chamarShopee<{ response?: { tracking_number?: string } }>("/api/v2/logistics/get_tracking_number", loja, { consulta: { order_sn: sn } });
  return r.response?.tracking_number ?? "";
}

class Recado extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

async function organizarPorPostagem(loja: Loja, sn: string) {
  const p = await chamarShopee<{ response?: { info_needed?: { dropoff?: string[]; pickup?: string[] } } }>(
    "/api/v2/logistics/get_shipping_parameter",
    loja,
    { consulta: { order_sn: sn } },
  );
  const dropoff = p.response?.info_needed?.dropoff;
  if (!dropoff || dropoff.length) {
    throw new Recado(409, "Este pedido precisa de coleta ou de escolher a agência. Organize o envio no Seller Centre da Shopee e volte aqui para a etiqueta.");
  }
  await chamarShopee("/api/v2/logistics/ship_order", loja, { json: { order_sn: sn, dropoff: {} } });
}

export async function GET(req: Request) {
  const contaId = await contaDaSessao();
  const params = new URL(req.url).searchParams;
  const id = params.get("pedido") ?? "";
  if (!contaId) return NextResponse.json({ erro: "Entre na sua conta." }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });

  const db = obterDb();
  const [p] = await db
    .select({ conexaoId: pedidos.conexaoId, idExterno: pedidos.idExterno })
    .from(pedidos)
    .where(and(eq(pedidos.id, id), eq(pedidos.contaId, contaId), eq(pedidos.canal, "shopee")));
  if (!p?.conexaoId || !p.idExterno) return NextResponse.json({ erro: "Este pedido não é da Shopee." }, { status: 404 });
  const sn = p.idExterno;

  try {
    const loja = await lojaValida(p.conexaoId);
    let numero = await rastreio(loja, sn);
    if (!numero) {
      if (params.get("organizar") !== "1") throw new Recado(409, "O envio deste pedido ainda não foi organizado na Shopee.");
      await organizarPorPostagem(loja, sn);
      // o número de rastreio leva alguns segundos para sair depois de organizar
      for (let i = 0; i < 5 && !numero; i++) {
        await esperar(1500);
        numero = await rastreio(loja, sn);
      }
      if (!numero) throw new Recado(202, "Envio organizado. A Shopee ainda está gerando o rastreio: tente a etiqueta de novo em um minuto.");
      await db.update(pedidos).set({ situacao: "pronto_para_envio", codigoRastreio: numero }).where(eq(pedidos.id, id));
    }

    const param = await chamarShopee<Resultado<{ suggest_shipping_document_type?: string }>>(
      "/api/v2/logistics/get_shipping_document_parameter",
      loja,
      { json: { order_list: [{ order_sn: sn }] } },
    );
    const tipo = param.response?.result_list?.[0]?.suggest_shipping_document_type ?? "THERMAL_AIR_WAYBILL";

    await chamarShopee<Resultado<object>>("/api/v2/logistics/create_shipping_document", loja, {
      json: { order_list: [{ order_sn: sn, tracking_number: numero, shipping_document_type: tipo }] },
    });
    let situacao = "PROCESSING";
    for (let i = 0; i < 6 && situacao === "PROCESSING"; i++) {
      if (i) await esperar(1500);
      const r = await chamarShopee<Resultado<{ status?: string }>>("/api/v2/logistics/get_shipping_document_result", loja, {
        json: { order_list: [{ order_sn: sn, shipping_document_type: tipo }] },
      });
      situacao = r.response?.result_list?.[0]?.status ?? "FAILED";
    }
    if (situacao !== "READY") throw new Recado(situacao === "PROCESSING" ? 202 : 502, "A Shopee ainda não terminou a etiqueta. Tente de novo em um minuto.");

    const arquivo = await baixarShopee("/api/v2/logistics/download_shipping_document", loja, {
      shipping_document_type: tipo,
      order_list: [{ order_sn: sn }],
    });
    return new Response(arquivo.body, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="etiqueta-shopee-${sn}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof Recado) return NextResponse.json({ erro: e.message }, { status: e.status });
    console.error("etiqueta Shopee falhou:", e instanceof ErroShopee ? e.codigo : e);
    const msg = e instanceof ErroShopee && e.codigo === "reconectar" ? "A autorização da Shopee venceu. Reconecte em Canais." : "Não deu para baixar a etiqueta agora. Tente de novo.";
    return NextResponse.json({ erro: msg }, { status: e instanceof ErroShopee ? e.status : 500 });
  }
}
