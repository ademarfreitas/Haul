// Testa uma conexão: pega um token válido (renovando se preciso) e busca os dados da loja.
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { contaDaSessao } from "@/lib/sessao";
import { chamarMagalu, emSandboxMagalu, ErroMagalu, lojaMagaluValida, type LojaMagalu } from "@/lib/magalu";

export async function GET(req: Request) {
  const contaId = await contaDaSessao();
  const id = new URL(req.url).searchParams.get("id");
  if (!contaId || !id) return NextResponse.json({ ok: false, erro: "sem_sessao" }, { status: 401 });

  const [c] = await obterDb()
    .select({ id: conexoesCanal.id })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.id, id), eq(conexoesCanal.contaId, contaId), eq(conexoesCanal.canal, "magalu")));
  if (!c) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  try {
    const loja = await lojaMagaluValida(c.id);
    const info = await chamarMagalu<LojaMagalu>("/seller/v1/portfolios/me", loja.accessToken);
    return NextResponse.json({ ok: true, loja: loja.tenant, nome: info.seller?.name ?? null, canal: info.channel?.name ?? null, sandbox: emSandboxMagalu() });
  } catch (e) {
    const erro = e instanceof ErroMagalu ? e.codigo : "falha_interna";
    return NextResponse.json({ ok: false, erro }, { status: e instanceof ErroMagalu ? e.status : 500 });
  }
}
