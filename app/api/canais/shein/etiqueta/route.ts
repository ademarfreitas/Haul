// Etiqueta oficial da Shein (é o código de barras dela que a coleta ou a agência lê).
// No Brasil a Shein só gera a etiqueta depois que a NF-e do pedido foi enviada a ela. A resposta traz o
// endereço do PDF: o Plist manda o navegador direto para ele.
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { pedidos } from "@/db/schema";
import { contaDaSessao } from "@/lib/sessao";
import { CAMINHOS_SHEIN, chamarShein, comChaves, ErroShein } from "@/lib/shein";
import { detalhesShein } from "@/lib/shein-pedidos";

// primeiro endereço https com cara de etiqueta, em qualquer nível da resposta
function enderecoPdf(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  for (const k of ["filePdfUrl", "fileUrl", "labelUrl", "url"]) {
    if (typeof o[k] === "string" && (o[k] as string).startsWith("https://")) return o[k] as string;
  }
  for (const filho of Array.isArray(v) ? v : Object.values(o)) {
    const achado = enderecoPdf(filho);
    if (achado) return achado;
  }
  return null;
}

export async function GET(req: Request) {
  const contaId = await contaDaSessao();
  const id = new URL(req.url).searchParams.get("pedido") ?? "";
  if (!contaId) return NextResponse.json({ erro: "Entre na sua conta." }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });

  const [p] = await obterDb()
    .select({ conexaoId: pedidos.conexaoId, idExterno: pedidos.idExterno })
    .from(pedidos)
    .where(and(eq(pedidos.id, id), eq(pedidos.contaId, contaId), eq(pedidos.canal, "shein")));
  if (!p?.conexaoId || !p.idExterno) return NextResponse.json({ erro: "Este pedido não é da Shein." }, { status: 404 });
  const numero = p.idExterno;

  try {
    const url = await comChaves(p.conexaoId, async (chaves) => {
      // os pacotes do pedido (normalmente um) vêm do detalhe
      const [detalhe] = await detalhesShein([numero], chaves);
      const pacotes = (detalhe?.packageWaybillList ?? []).map((x) => x.packageNo).filter((x): x is string => !!x);
      if (!pacotes.length) return null;
      return enderecoPdf(await chamarShein<unknown>(CAMINHOS_SHEIN.etiqueta, chaves, { json: { orderNo: numero, packageNo: pacotes } }));
    });
    if (!url) return NextResponse.json({ erro: "A Shein ainda não liberou a etiqueta deste pedido. Confira se a NF-e já foi enviada." }, { status: 409 });
    return NextResponse.redirect(url, { status: 303 });
  } catch (e) {
    console.error("etiqueta Shein falhou:", e instanceof ErroShein ? e.codigo : e);
    const msg =
      e instanceof ErroShein && e.codigo === "reconectar"
        ? "A Shein recusou as chaves da loja. Reconecte em Canais."
        : e instanceof ErroShein && e.status === 400
          ? `A Shein não gerou a etiqueta: ${e.message} (confira se a NF-e do pedido já foi enviada).`
          : "Não deu para buscar a etiqueta agora. Tente de novo.";
    return NextResponse.json({ erro: msg }, { status: e instanceof ErroShein ? e.status : 500 });
  }
}
