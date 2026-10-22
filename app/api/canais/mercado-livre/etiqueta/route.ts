// Etiqueta oficial do Mercado Livre em PDF (é o código de barras dela que a coleta lê).
// O ML só entrega a etiqueta com o envio pronto para despacho (ready_to_ship).
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { pedidos } from "@/db/schema";
import { contaDaSessao } from "@/lib/sessao";
import { baixarApi, ErroMl, tokenValido } from "@/lib/mercado-livre";

export async function GET(req: Request) {
  const contaId = await contaDaSessao();
  const id = new URL(req.url).searchParams.get("pedido") ?? "";
  if (!contaId) return NextResponse.json({ erro: "Entre na sua conta." }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });

  const [p] = await obterDb()
    .select({ conexaoId: pedidos.conexaoId, dados: pedidos.dadosBrutos, idExterno: pedidos.idExterno })
    .from(pedidos)
    .where(and(eq(pedidos.id, id), eq(pedidos.contaId, contaId), eq(pedidos.canal, "mercado_livre")));
  const envioId = (p?.dados as { envioId?: number } | null)?.envioId;
  if (!p?.conexaoId || !envioId) return NextResponse.json({ erro: "Este pedido não tem envio do Mercado Livre." }, { status: 404 });

  try {
    const r = await baixarApi(`/shipment_labels?shipment_ids=${envioId}&response_type=pdf`, await tokenValido(p.conexaoId));
    return new Response(r.body, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="etiqueta-ml-${p.idExterno}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error("etiqueta ML falhou:", e instanceof ErroMl ? e.codigo : e);
    const msg =
      e instanceof ErroMl && e.status === 400
        ? "O Mercado Livre ainda não liberou a etiqueta (o envio precisa estar pronto para despacho)."
        : "Não deu para baixar a etiqueta agora. Tente de novo.";
    return NextResponse.json({ erro: msg }, { status: e instanceof ErroMl ? e.status : 500 });
  }
}
