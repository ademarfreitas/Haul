// Testa uma conexão: assina uma chamada com as chaves da loja e busca os dados dela.
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { contaDaSessao } from "@/lib/sessao";
import { comChaves, ErroShein, lojaShein } from "@/lib/shein";

export async function GET(req: Request) {
  const contaId = await contaDaSessao();
  const id = new URL(req.url).searchParams.get("id");
  if (!contaId || !id) return NextResponse.json({ ok: false, erro: "sem_sessao" }, { status: 401 });

  const [c] = await obterDb()
    .select({ id: conexoesCanal.id })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.id, id), eq(conexoesCanal.contaId, contaId), eq(conexoesCanal.canal, "shein")));
  if (!c) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  try {
    const loja = await comChaves(c.id, lojaShein);
    return NextResponse.json({ ok: true, nome: loja.nome, fornecedor: loja.fornecedor });
  } catch (e) {
    const erro = e instanceof ErroShein ? e.codigo : "falha_interna";
    return NextResponse.json({ ok: false, erro }, { status: e instanceof ErroShein ? e.status : 500 });
  }
}
