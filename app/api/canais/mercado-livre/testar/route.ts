// Testa uma conexão: pega um token válido (renovando se preciso) e chama /users/me.
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { contaDaSessao } from "@/lib/sessao";
import { chamarApi, ErroMl, tokenValido, type UsuarioMl } from "@/lib/mercado-livre";

export async function GET(req: Request) {
  const contaId = await contaDaSessao();
  const id = new URL(req.url).searchParams.get("id");
  if (!contaId || !id) return NextResponse.json({ ok: false, erro: "sem_sessao" }, { status: 401 });

  const [c] = await obterDb()
    .select({ id: conexoesCanal.id })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.id, id), eq(conexoesCanal.contaId, contaId)));
  if (!c) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  try {
    const u = await chamarApi<UsuarioMl>("/users/me", await tokenValido(c.id));
    return NextResponse.json({ ok: true, vendedor: u.id, apelido: u.nickname, site: u.site_id });
  } catch (e) {
    const erro = e instanceof ErroMl ? e.codigo : "falha_interna";
    return NextResponse.json({ ok: false, erro }, { status: e instanceof ErroMl ? e.status : 500 });
  }
}
