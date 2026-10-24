// Começa a conexão: guarda o state num cookie assinado e manda para a tela de consentimento do Seller Central.
// Também é o "Login URI" do app: quem vem da Appstore da Amazon chega com amazon_callback_uri e amazon_state,
// e devolvemos para a Amazon com o nosso state.
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { assinar, contaDaSessao, cookieSeguro } from "@/lib/sessao";
import { destinoSeguro } from "@/lib/mercado-livre";
import {
  COOKIE_OAUTH_AMAZON,
  urlAutorizacaoAmazon,
  urlRetornoAppstore,
  variaveisFaltandoAmazon,
  type EstadoOauthAmazon,
} from "@/lib/amazon";
import { irPara } from "@/lib/rotas";

const DEZ_MINUTOS = 10 * 60;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const voltar = destinoSeguro(params.get("voltar"));
  const contaId = await contaDaSessao();
  if (!contaId) return irPara(`${voltar}?amazon_erro=sem_sessao`, req);
  const faltando = variaveisFaltandoAmazon();
  if (faltando.length) return irPara(`${voltar}?amazon_erro=config_incompleta&faltando=${faltando.join(",")}`, req);

  const state = randomBytes(24).toString("base64url");
  const callbackAppstore = params.get("amazon_callback_uri");
  const destino = callbackAppstore ? urlRetornoAppstore(callbackAppstore, params.get("amazon_state") ?? "", state) : urlAutorizacaoAmazon(state);
  if (!destino) return irPara(`${voltar}?amazon_erro=state_invalido`, req);

  const resp = NextResponse.redirect(destino, { status: 303 });
  resp.cookies.set(COOKIE_OAUTH_AMAZON, assinar({ state, contaId, voltar } satisfies EstadoOauthAmazon, DEZ_MINUTOS), {
    httpOnly: true,
    secure: cookieSeguro(),
    sameSite: "lax", // a Amazon volta por um GET de nível superior: lax ainda manda o cookie
    path: "/api/canais/amazon",
    maxAge: DEZ_MINUTOS,
  });
  return resp;
}
