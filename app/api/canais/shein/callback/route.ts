// Volta da Shein: confere o state, troca o tempToken pelas chaves da loja, busca a loja e grava a conexão.
// A Shein devolve ?tempToken=...&state=... (o tempToken vale 10 minutos).
import { cookies } from "next/headers";
import { conferirAssinado, contaDaSessao } from "@/lib/sessao";
import { destinoSeguro } from "@/lib/mercado-livre";
import { COOKIE_OAUTH_SHEIN, ErroShein, lojaShein, salvarConexaoShein, trocarTempToken, type EstadoOauthShein } from "@/lib/shein";
import { irPara } from "@/lib/rotas";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  const salvo = conferirAssinado<EstadoOauthShein>(jar.get(COOKIE_OAUTH_SHEIN)?.value);
  const voltar = destinoSeguro(salvo?.voltar ?? null);
  // o cookie do state é de uso único: sai em qualquer resposta
  const sair = (consulta: string) => {
    const resp = irPara(`${voltar}?${consulta}`, req);
    resp.cookies.set(COOKIE_OAUTH_SHEIN, "", { path: "/api/canais/shein", maxAge: 0 });
    return resp;
  };

  const tempToken = params.get("tempToken");
  if (!salvo || !tempToken || params.get("state") !== salvo.state) return sair("shein_erro=state_invalido");
  if ((await contaDaSessao()) !== salvo.contaId) return sair("shein_erro=sem_sessao");

  try {
    const chaves = await trocarTempToken(tempToken);
    await salvarConexaoShein(salvo.contaId, chaves, await lojaShein(chaves));
    return sair("shein=conectado");
  } catch (e) {
    const codigo = e instanceof ErroShein ? e.codigo : "falha_interna";
    // só o código do erro: a resposta da Shein tem as chaves da loja
    console.error("callback Shein falhou:", codigo);
    return sair(`shein_erro=${encodeURIComponent(codigo)}`);
  }
}
