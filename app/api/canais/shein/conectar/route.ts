// Começa a conexão: guarda o state num cookie assinado e manda para a página de autorização da Shein.
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { assinar, contaDaSessao, cookieSeguro } from "@/lib/sessao";
import { destinoSeguro } from "@/lib/mercado-livre";
import { COOKIE_OAUTH_SHEIN, urlAutorizacaoShein, variaveisFaltandoShein, type EstadoOauthShein } from "@/lib/shein";
import { irPara } from "@/lib/rotas";

const DEZ_MINUTOS = 10 * 60;

export async function GET(req: Request) {
  const voltar = destinoSeguro(new URL(req.url).searchParams.get("voltar"));
  const contaId = await contaDaSessao();
  if (!contaId) return irPara(`${voltar}?shein_erro=sem_sessao`, req);
  const faltando = variaveisFaltandoShein();
  if (faltando.length) return irPara(`${voltar}?shein_erro=config_incompleta&faltando=${faltando.join(",")}`, req);

  const state = randomBytes(24).toString("base64url");
  const resp = NextResponse.redirect(urlAutorizacaoShein(state), { status: 303 });
  resp.cookies.set(COOKIE_OAUTH_SHEIN, assinar({ state, contaId, voltar } satisfies EstadoOauthShein, DEZ_MINUTOS), {
    httpOnly: true,
    secure: cookieSeguro(),
    sameSite: "lax", // a Shein volta por um GET de nível superior: lax ainda manda o cookie
    path: "/api/canais/shein",
    maxAge: DEZ_MINUTOS,
  });
  return resp;
}
