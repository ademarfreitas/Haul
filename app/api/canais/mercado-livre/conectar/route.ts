// Começa a conexão: guarda state + code_verifier num cookie assinado e manda para o login do ML.
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { assinar, contaDaSessao, cookieSeguro } from "@/lib/sessao";
import { COOKIE_OAUTH, novoPkce, urlAutorizacao, type EstadoOauth } from "@/lib/mercado-livre";
import { irPara } from "@/lib/rotas";

const DEZ_MINUTOS = 10 * 60;

export async function GET(req: Request) {
  const contaId = await contaDaSessao();
  if (!contaId) return irPara("/entrar?volta=/canais", req);

  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = novoPkce();
  const resp = NextResponse.redirect(urlAutorizacao(state, challenge), { status: 303 });
  resp.cookies.set(COOKIE_OAUTH, assinar({ state, verifier, contaId } satisfies EstadoOauth, DEZ_MINUTOS), {
    httpOnly: true,
    secure: cookieSeguro(),
    sameSite: "lax", // o ML volta por um GET de nível superior: lax ainda manda o cookie
    path: "/api/canais/mercado-livre",
    maxAge: DEZ_MINUTOS,
  });
  return resp;
}
