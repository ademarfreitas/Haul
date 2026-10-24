// Testa uma conexão: pega um token válido (renovando se preciso) e confere a loja da Amazon.com.br.
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { contaDaSessao } from "@/lib/sessao";
import { contaAmazonValida, ErroAmazon, participacaoBrasil } from "@/lib/amazon";

export async function GET(req: Request) {
  const contaId = await contaDaSessao();
  const id = new URL(req.url).searchParams.get("id");
  if (!contaId || !id) return NextResponse.json({ ok: false, erro: "sem_sessao" }, { status: 401 });

  const [c] = await obterDb()
    .select({ id: conexoesCanal.id })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.id, id), eq(conexoesCanal.contaId, contaId), eq(conexoesCanal.canal, "amazon")));
  if (!c) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  try {
    const { token, vendedorId } = await contaAmazonValida(c.id);
    const brasil = await participacaoBrasil(token);
    return NextResponse.json({ ok: !!brasil, vendedor: vendedorId, loja: brasil?.storeName ?? null, marketplace: brasil?.marketplace.name ?? null });
  } catch (e) {
    const erro = e instanceof ErroAmazon ? e.codigo : "falha_interna";
    return NextResponse.json({ ok: false, erro }, { status: e instanceof ErroAmazon ? e.status : 500 });
  }
}
