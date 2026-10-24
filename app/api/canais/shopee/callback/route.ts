// Volta da Shopee: confere o state, troca o code por tokens, busca a loja e grava a conexão.
// A Shopee devolve ?code=...&shop_id=... (ou main_account_id, quando quem autoriza é uma conta principal).
import { cookies } from "next/headers";
import { conferirAssinado, contaDaSessao } from "@/lib/sessao";
import { destinoSeguro } from "@/lib/mercado-livre";
import {
  chamarShopee,
  COOKIE_OAUTH_SHOPEE,
  ErroShopee,
  salvarConexaoShopee,
  trocarCodigoShopee,
  type EstadoOauthShopee,
  type LojaShopee,
} from "@/lib/shopee";
import { irPara } from "@/lib/rotas";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  const salvo = conferirAssinado<EstadoOauthShopee>(jar.get(COOKIE_OAUTH_SHOPEE)?.value);
  const voltar = destinoSeguro(salvo?.voltar ?? null);
  // o cookie do state é de uso único: sai em qualquer resposta
  const sair = (consulta: string) => {
    const resp = irPara(`${voltar}?${consulta}`, req);
    resp.cookies.set(COOKIE_OAUTH_SHOPEE, "", { path: "/api/canais/shopee", maxAge: 0 });
    return resp;
  };

  const code = params.get("code");
  if (!salvo || !code || params.get("state") !== salvo.state) return sair("shopee_erro=state_invalido");
  if ((await contaDaSessao()) !== salvo.contaId) return sair("shopee_erro=sem_sessao");
  const shopId = Number(params.get("shop_id"));
  if (!shopId) return sair(params.get("main_account_id") ? "shopee_erro=conta_principal" : "shopee_erro=sem_loja");

  try {
    const token = await trocarCodigoShopee(code, shopId);
    const loja = await chamarShopee<LojaShopee>("/api/v2/shop/get_shop_info", { accessToken: token.access_token, shopId });
    if (loja.region !== "BR") return sair("shopee_erro=conta_fora_do_brasil");
    await salvarConexaoShopee(salvo.contaId, shopId, token, loja);
    return sair("shopee=conectado");
  } catch (e) {
    const codigo = e instanceof ErroShopee ? e.codigo : "falha_interna";
    // só o código do erro: a mensagem e o corpo podem ter dados da loja
    console.error("callback Shopee falhou:", codigo);
    return sair(`shopee_erro=${encodeURIComponent(codigo)}`);
  }
}
