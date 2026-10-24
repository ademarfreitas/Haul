// Volta do Seller Central: confere o state, troca o spapi_oauth_code por tokens, confere a loja do Brasil e grava.
// A Amazon devolve ?state=...&selling_partner_id=...&spapi_oauth_code=... (ou ?error=... se o vendedor recusar).
import { cookies } from "next/headers";
import { conferirAssinado, contaDaSessao } from "@/lib/sessao";
import { destinoSeguro } from "@/lib/mercado-livre";
import {
  assinarAvisosAmazon,
  COOKIE_OAUTH_AMAZON,
  ErroAmazon,
  participacaoBrasil,
  salvarConexaoAmazon,
  trocarCodigoAmazon,
  type EstadoOauthAmazon,
} from "@/lib/amazon";
import { irPara } from "@/lib/rotas";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  const salvo = conferirAssinado<EstadoOauthAmazon>(jar.get(COOKIE_OAUTH_AMAZON)?.value);
  const voltar = destinoSeguro(salvo?.voltar ?? null);
  // o cookie do state é de uso único: sai em qualquer resposta
  const sair = (consulta: string) => {
    const resp = irPara(`${voltar}?${consulta}`, req);
    resp.cookies.set(COOKIE_OAUTH_AMAZON, "", { path: "/api/canais/amazon", maxAge: 0 });
    return resp;
  };

  if (params.get("error")) return sair("amazon_erro=access_denied");
  const code = params.get("spapi_oauth_code");
  const vendedorId = params.get("selling_partner_id");
  if (!salvo || !code || params.get("state") !== salvo.state) return sair("amazon_erro=state_invalido");
  if ((await contaDaSessao()) !== salvo.contaId) return sair("amazon_erro=sem_sessao");
  if (!vendedorId || !/^[A-Z0-9]{8,20}$/.test(vendedorId)) return sair("amazon_erro=sem_vendedor");

  try {
    const token = await trocarCodigoAmazon(code);
    const brasil = await participacaoBrasil(token.access_token);
    if (!brasil) return sair("amazon_erro=conta_fora_do_brasil");
    await salvarConexaoAmazon(salvo.contaId, vendedorId, token, brasil.storeName ?? null);
    await assinarAvisosAmazon(token.access_token);
    return sair("amazon=conectado");
  } catch (e) {
    const codigo = e instanceof ErroAmazon ? e.codigo : "falha_interna";
    // só o código do erro: a mensagem e o corpo podem ter dados da conta
    console.error("callback Amazon falhou:", codigo);
    return sair(`amazon_erro=${encodeURIComponent(codigo)}`);
  }
}
