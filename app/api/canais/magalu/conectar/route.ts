// Começa a conexão: guarda o state num cookie assinado e manda para o login do ID Magalu.
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { assinar, contaDaSessao, cookieSeguro } from "@/lib/sessao";
import { destinoSeguro } from "@/lib/mercado-livre";
import { COOKIE_OAUTH_MAGALU, urlAutorizacaoMagalu, variaveisFaltandoMagalu, type EstadoOauthMagalu } from "@/lib/magalu";
import { irPara } from "@/lib/rotas";

const DEZ_MINUTOS = 10 * 60;

export async function GET(req: Request) {
  const voltar = destinoSeguro(new URL(req.url).searchParams.get("voltar"));
  const contaId = await contaDaSessao();
  if (!contaId) return irPara(`${voltar}?magalu_erro=sem_sessao`, req);
  const faltando = variaveisFaltandoMagalu();
  if (faltando.length) return irPara(`${voltar}?magalu_erro=config_incompleta&faltando=${faltando.join(",")}`, req);

  const state = randomBytes(24).toString("base64url");
  const resp = NextResponse.redirect(urlAutorizacaoMagalu(state), { status: 303 });
  resp.cookies.set(COOKIE_OAUTH_MAGALU, assinar({ state, contaId, voltar } satisfies EstadoOauthMagalu, DEZ_MINUTOS), {
    httpOnly: true,
    secure: cookieSeguro(),
    sameSite: "lax", // o ID Magalu volta por um GET de nível superior: lax ainda manda o cookie
    path: "/api/canais/magalu",
    maxAge: DEZ_MINUTOS,
  });
  return resp;
}
