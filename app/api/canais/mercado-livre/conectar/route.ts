// Começa a conexão: guarda state + code_verifier num cookie assinado e manda para o login do ML.
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { assinar, contaDaSessao, cookieSeguro } from "@/lib/sessao";
import {
  COOKIE_OAUTH,
  destinoSeguro,
  novoPkce,
  urlAutorizacao,
  variaveisFaltando,
  type EstadoOauth,
} from "@/lib/mercado-livre";
import { irPara } from "@/lib/rotas";

const DEZ_MINUTOS = 10 * 60;

export async function GET(req: Request) {
  const voltar = destinoSeguro(new URL(req.url).searchParams.get("voltar"));
  const contaId = await contaDaSessao();
  if (!contaId) return irPara(`${voltar}?ml_erro=sem_sessao`, req);
  const faltando = variaveisFaltando();
  if (faltando.length) return irPara(`${voltar}?ml_erro=config_incompleta&faltando=${faltando.join(",")}`, req);

  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = novoPkce();
  const resp = NextResponse.redirect(urlAutorizacao(state, challenge), { status: 303 });
  resp.cookies.set(COOKIE_OAUTH, assinar({ state, verifier, contaId, voltar } satisfies EstadoOauth, DEZ_MINUTOS), {
    httpOnly: true,
    secure: cookieSeguro(),
    sameSite: "lax", // o ML volta por um GET de nível superior: lax ainda manda o cookie
    path: "/api/canais/mercado-livre",
    maxAge: DEZ_MINUTOS,
  });
  return resp;
}
