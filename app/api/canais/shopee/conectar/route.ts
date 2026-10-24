// Começa a conexão: guarda o state num cookie assinado e manda para a tela de autorização da Shopee.
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { assinar, contaDaSessao, cookieSeguro } from "@/lib/sessao";
import { destinoSeguro } from "@/lib/mercado-livre";
import {
  COOKIE_OAUTH_SHOPEE,
  urlAutorizacaoShopee,
  variaveisFaltandoShopee,
  type EstadoOauthShopee,
} from "@/lib/shopee";
import { irPara } from "@/lib/rotas";

const DEZ_MINUTOS = 10 * 60;

export async function GET(req: Request) {
  const voltar = destinoSeguro(new URL(req.url).searchParams.get("voltar"));
  const contaId = await contaDaSessao();
  if (!contaId) return irPara(`${voltar}?shopee_erro=sem_sessao`, req);
  const faltando = variaveisFaltandoShopee();
  if (faltando.length) return irPara(`${voltar}?shopee_erro=config_incompleta&faltando=${faltando.join(",")}`, req);

  const state = randomBytes(24).toString("base64url");
  const resp = NextResponse.redirect(urlAutorizacaoShopee(state), { status: 303 });
  resp.cookies.set(COOKIE_OAUTH_SHOPEE, assinar({ state, contaId, voltar } satisfies EstadoOauthShopee, DEZ_MINUTOS), {
    httpOnly: true,
    secure: cookieSeguro(),
    sameSite: "lax", // a Shopee volta por um GET de nível superior: lax ainda manda o cookie
    path: "/api/canais/shopee",
    maxAge: DEZ_MINUTOS,
  });
  return resp;
}
