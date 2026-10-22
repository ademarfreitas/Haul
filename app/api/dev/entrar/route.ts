// Provisório até existir cadastro/login: entra numa conta de desenvolvimento.
// Uso: /api/dev/entrar?codigo=<CODIGO_CONTA_DEV>. Sem o código certo, responde 404.
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { contas } from "@/db/schema";
import { assinar, codigoDevConfere, COOKIE_CONTA, cookieSeguro } from "@/lib/sessao";
import { irPara } from "@/lib/rotas";

const NOME = "Conta de desenvolvimento";
const TRINTA_DIAS = 30 * 24 * 60 * 60;

export async function GET(req: Request) {
  if (!codigoDevConfere(new URL(req.url).searchParams.get("codigo"))) {
    return new NextResponse("Não encontrado", { status: 404 });
  }
  const db = obterDb();
  let [conta] = await db.select({ id: contas.id }).from(contas).where(eq(contas.nome, NOME)).limit(1);
  if (!conta) [conta] = await db.insert(contas).values({ nome: NOME }).returning({ id: contas.id });

  const resp = irPara("/canais", req);
  resp.cookies.set(COOKIE_CONTA, assinar(conta.id, TRINTA_DIAS), {
    httpOnly: true,
    secure: cookieSeguro(),
    sameSite: "lax",
    path: "/",
    maxAge: TRINTA_DIAS,
  });
  return resp;
}
