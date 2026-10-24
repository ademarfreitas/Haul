// Volta do ID Magalu: confere o state, troca o code por tokens, descobre a loja (tenant) e grava a conexão.
import { cookies } from "next/headers";
import { conferirAssinado, contaDaSessao } from "@/lib/sessao";
import { destinoSeguro } from "@/lib/mercado-livre";
import {
  chamarMagalu,
  COOKIE_OAUTH_MAGALU,
  ErroMagalu,
  prepararSandboxMagalu,
  salvarConexaoMagalu,
  trocarCodigoMagalu,
  type EstadoOauthMagalu,
  type LojaMagalu,
} from "@/lib/magalu";
import { irPara } from "@/lib/rotas";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  const salvo = conferirAssinado<EstadoOauthMagalu>(jar.get(COOKIE_OAUTH_MAGALU)?.value);
  const voltar = destinoSeguro(salvo?.voltar ?? null);
  // o cookie do state é de uso único: sai em qualquer resposta
  const sair = (consulta: string) => {
    const resp = irPara(`${voltar}?${consulta}`, req);
    resp.cookies.set(COOKIE_OAUTH_MAGALU, "", { path: "/api/canais/magalu", maxAge: 0 });
    return resp;
  };

  if (params.get("error")) return sair(`magalu_erro=${encodeURIComponent(params.get("error")!.slice(0, 40))}`);
  const code = params.get("code");
  if (!salvo || !code || params.get("state") !== salvo.state) return sair("magalu_erro=state_invalido");
  if ((await contaDaSessao()) !== salvo.contaId) return sair("magalu_erro=sem_sessao");

  try {
    const token = await trocarCodigoMagalu(code);
    await prepararSandboxMagalu(token.access_token);
    const loja = await chamarMagalu<LojaMagalu>("/seller/v1/portfolios/me", token.access_token);
    const tenant = loja.tenant?.id?.trim();
    if (!tenant) return sair("magalu_erro=sem_loja");
    await salvarConexaoMagalu(salvo.contaId, tenant, token, loja.seller?.name?.trim() || loja.seller?.id || null);
    return sair("magalu=conectado");
  } catch (e) {
    const codigo = e instanceof ErroMagalu ? e.codigo : "falha_interna";
    // só o código do erro: a mensagem e o corpo podem ter dados da loja
    console.error("callback Magalu falhou:", codigo);
    return sair(`magalu_erro=${encodeURIComponent(codigo)}`);
  }
}
