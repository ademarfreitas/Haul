// Volta do ML: confere o state, troca o code por tokens, busca o usuário e grava a conexão.
import { cookies } from "next/headers";
import { conferirAssinado, contaDaSessao } from "@/lib/sessao";
import {
  chamarApi,
  COOKIE_OAUTH,
  destinoSeguro,
  ErroMl,
  salvarConexao,
  trocarCodigo,
  type EstadoOauth,
  type UsuarioMl,
} from "@/lib/mercado-livre";
import { irPara } from "@/lib/rotas";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  const salvo = conferirAssinado<EstadoOauth>(jar.get(COOKIE_OAUTH)?.value);
  // o cookie do state é de uso único: sai em qualquer resposta
  // volta para onde o lojista começou (Canais ou primeiros passos)
  const voltar = destinoSeguro(salvo?.voltar ?? null);
  const sair = (consulta: string) => {
    const resp = irPara(`${voltar}?${consulta}`, req);
    resp.cookies.set(COOKIE_OAUTH, "", { path: "/api/canais/mercado-livre", maxAge: 0 });
    return resp;
  };

  // o lojista recusou no ML, ou o ML devolveu erro
  if (params.get("error")) return sair(`ml_erro=${encodeURIComponent(params.get("error")!)}`);

  const code = params.get("code");
  if (!salvo || !code || params.get("state") !== salvo.state) return sair("ml_erro=state_invalido");
  if ((await contaDaSessao()) !== salvo.contaId) return sair("ml_erro=sem_sessao");

  try {
    const token = await trocarCodigo(code, salvo.verifier);
    const usuario = await chamarApi<UsuarioMl>("/users/me", token.access_token);
    if (usuario.site_id !== "MLB") return sair("ml_erro=conta_fora_do_brasil");
    await salvarConexao(salvo.contaId, token, usuario);
    // conectou, mas sem refresh token a conexão cai em poucas horas: avisa para ligar offline_access no app
    return sair(token.refresh_token ? "ml=conectado" : "ml=conectado&ml_erro=sem_renovacao");
  } catch (e) {
    const codigo = e instanceof ErroMl ? e.codigo : "falha_interna";
    // só o código do erro: a mensagem e o corpo podem ter dados da conta
    console.error("callback ML falhou:", codigo);
    return sair(`ml_erro=${encodeURIComponent(codigo)}`);
  }
}
