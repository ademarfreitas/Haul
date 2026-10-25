// OAuth 2.0 do Mercado Livre (authorization code + PKCE S256) e renovação de token.
// Docs: https://developers.mercadolivre.com.br/pt-br/autenticacao-e-autorizacao
// - access token vale poucas horas (expires_in vem na resposta);
// - refresh token vale 6 meses e é de uso único: cada renovação devolve um novo, que tem de ser salvo.
import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal, tarefas, usuarios } from "@/db/schema";
import { cifrar, decifrar } from "@/lib/cripto";

const URL_AUTORIZACAO = "https://auth.mercadolivre.com.br/authorization";
const URL_API = "https://api.mercadolibre.com";
// renova um pouco antes de vencer, para não falhar no meio de uma chamada
const MARGEM_MS = 5 * 60 * 1000;

type RespostaToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token?: string;
};

// cookie assinado que guarda state e code_verifier entre /conectar e /callback
export const COOKIE_OAUTH = "plist_ml_oauth";
export type EstadoOauth = { state: string; verifier: string; contaId: string; voltar: string };

// Para onde o lojista volta depois do ML (ex.: Inventário). Só caminhos internos conhecidos,
// para o link não virar redirecionamento aberto.
const DESTINOS = ["/canais", "/inventario", "/primeiros-passos"];
export function destinoSeguro(voltar: string | null): string {
  return voltar && DESTINOS.includes(voltar) ? voltar : "/canais";
}

export type UsuarioMl = { id: number; nickname: string; site_id: string; email?: string };

export class ErroMl extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensagem: string,
    public causas: string[] = [],
  ) {
    super(mensagem);
  }
}

// nomes (nunca valores) das variáveis do ML que faltam no ambiente
export function variaveisFaltando(): string[] {
  return ["ML_CLIENT_ID", "ML_CLIENT_SECRET", "ML_REDIRECT_URI"].filter((n) => !process.env[n]?.trim());
}

function credenciais() {
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  const redirectUri = process.env.ML_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("ML_CLIENT_ID, ML_CLIENT_SECRET e ML_REDIRECT_URI precisam estar no .env.local");
  }
  return { clientId, clientSecret, redirectUri };
}

export function novoPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function urlAutorizacao(state: string, challenge: string): string {
  const { clientId, redirectUri } = credenciais();
  const u = new URL(URL_AUTORIZACAO);
  u.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return u.toString();
}

// fetch que falha por rede vira ErroMl, para a tela mostrar "fora do ar" e não "erro interno"
async function buscar(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ErroMl(503, "ml_indisponivel", "Não deu para falar com o Mercado Livre agora.");
  }
}

async function pedirToken(corpo: Record<string, string>): Promise<RespostaToken> {
  const r = await buscar(`${URL_API}/oauth/token`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(corpo),
  });
  const json = (await r.json().catch(() => ({}))) as Partial<RespostaToken> & { error?: string; message?: string };
  if (!r.ok || !json.access_token) {
    // nunca registrar o corpo enviado: tem client_secret e code
    throw new ErroMl(r.status, json.error ?? "erro_desconhecido", json.message ?? `token recusado (${r.status})`);
  }
  return json as RespostaToken;
}

export function trocarCodigo(code: string, verifier: string) {
  const { clientId, clientSecret, redirectUri } = credenciais();
  return pedirToken({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
}

function renovar(refreshToken: string) {
  const { clientId, clientSecret } = credenciais();
  return pedirToken({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
}

// GET por padrão; com `envio`, POST/PUT com JSON ou multipart (FormData, ex.: upload de foto).
export async function chamarApi<T>(
  caminho: string,
  accessToken: string,
  envio?: { metodo?: "GET" | "POST" | "PUT"; json?: unknown; form?: FormData; cabecalhos?: Record<string, string> },
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json", authorization: `Bearer ${accessToken}`, ...envio?.cabecalhos };
  if (envio?.json !== undefined) headers["content-type"] = "application/json";
  const r = await buscar(`${URL_API}${caminho}`, {
    method: envio?.metodo ?? "GET",
    headers,
    body: envio?.form ?? (envio?.json !== undefined ? JSON.stringify(envio.json) : undefined),
  });
  const json = (await r.json().catch(() => ({}))) as T & { error?: string; message?: string; cause?: unknown };
  if (!r.ok) {
    throw new ErroMl(r.status, json.error ?? "erro_desconhecido", json.message ?? `API ${r.status}`, causas(json.cause));
  }
  return json;
}

// Resposta crua (ex.: PDF da etiqueta). Erro do ML vira ErroMl como em chamarApi.
export async function baixarApi(caminho: string, accessToken: string): Promise<Response> {
  const r = await buscar(`${URL_API}${caminho}`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!r.ok) {
    const json = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new ErroMl(r.status, json.error ?? "erro_desconhecido", json.message ?? `API ${r.status}`);
  }
  return r;
}

// o ML explica a recusa de um anúncio em cause: [{ code, message, type }]; só os erros, sem os avisos
function causas(cause: unknown): string[] {
  if (!Array.isArray(cause)) return [];
  return cause
    .filter((c) => c && typeof c === "object" && (c as { type?: string }).type !== "warning")
    .map((c) => String((c as { message?: unknown }).message ?? (c as { code?: unknown }).code ?? ""))
    .filter(Boolean);
}

// refreshAnterior: o já cifrado no banco, mantido se a resposta vier sem refresh_token novo
function camposToken(t: RespostaToken, refreshAnterior: string | null = null) {
  return {
    accessTokenCifrado: cifrar(t.access_token),
    // o ML só manda refresh_token com o escopo offline_access; sem ele a conexão cai quando o access token vence
    refreshTokenCifrado: t.refresh_token ? cifrar(t.refresh_token) : refreshAnterior,
    tokenExpiraEm: new Date(Date.now() + t.expires_in * 1000),
    situacao: "ativa" as const,
  };
}

// Grava (ou reconecta) a conta do ML na conta do Plist. Uma conta do ML pertence a uma só conta do Plist.
export async function salvarConexao(contaId: string, t: RespostaToken, usuario: UsuarioMl) {
  const db = obterDb();
  const usuarioExterno = String(t.user_id);
  const [existente] = await db
    .select({ id: conexoesCanal.id, contaId: conexoesCanal.contaId })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.canal, "mercado_livre"), eq(conexoesCanal.usuarioExterno, usuarioExterno)));

  if (existente && existente.contaId !== contaId) {
    // conta sem nenhum usuário (a antiga "Conta de desenvolvimento") ninguém mais acessa: a conexão muda de dono
    const [dono] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.contaId, existente.contaId)).limit(1);
    if (dono) throw new ErroMl(409, "conta_ja_conectada", "Esta conta do Mercado Livre já está ligada a outra conta do Plist.");
    await db.update(conexoesCanal).set({ contaId }).where(eq(conexoesCanal.id, existente.id));
    await db.update(tarefas).set({ contaId }).where(eq(tarefas.conexaoId, existente.id));
  }

  const campos = { ...camposToken(t), apelido: usuario.nickname };
  if (existente) {
    await db.update(conexoesCanal).set(campos).where(eq(conexoesCanal.id, existente.id));
    await fecharTarefaReconectar(existente.id);
    return existente.id;
  }
  const [nova] = await db
    .insert(conexoesCanal)
    .values({ contaId, canal: "mercado_livre", usuarioExterno, ...campos })
    .returning({ id: conexoesCanal.id });
  return nova.id;
}

async function fecharTarefaReconectar(conexaoId: string) {
  await obterDb()
    .update(tarefas)
    .set({ situacao: "concluida", concluidaEm: new Date() })
    .where(and(eq(tarefas.conexaoId, conexaoId), eq(tarefas.tipo, "reconectar_canal"), eq(tarefas.situacao, "aberta")));
}

async function marcarExpirada(conexao: { id: string; contaId: string; apelido: string | null }) {
  const db = obterDb();
  await db.update(conexoesCanal).set({ situacao: "expirada" }).where(eq(conexoesCanal.id, conexao.id));
  const [aberta] = await db
    .select({ id: tarefas.id })
    .from(tarefas)
    .where(and(eq(tarefas.conexaoId, conexao.id), eq(tarefas.tipo, "reconectar_canal"), eq(tarefas.situacao, "aberta")));
  if (!aberta) {
    await db.insert(tarefas).values({
      contaId: conexao.contaId,
      conexaoId: conexao.id,
      tipo: "reconectar_canal",
      titulo: "Reconectar o Mercado Livre",
      detalhe: `A conexão${conexao.apelido ? ` com ${conexao.apelido}` : ""} perdeu a autorização. Conecte de novo em Canais.`,
    });
  }
}

// Access token válido para a conexão, renovando se estiver para vencer.
// Duas renovações ao mesmo tempo: a segunda recebe invalid_grant (refresh já usado); então relê o
// banco e, se a primeira já gravou um token novo, usa esse. Só marca "expirada" se não houver.
export async function tokenValido(conexaoId: string): Promise<string> {
  const db = obterDb();
  const ler = async () => {
    const [c] = await db.select().from(conexoesCanal).where(eq(conexoesCanal.id, conexaoId));
    if (!c) throw new Error("conexão não encontrada");
    return c;
  };
  const vigente = (c: Awaited<ReturnType<typeof ler>>) =>
    c.situacao === "ativa" && c.accessTokenCifrado && c.tokenExpiraEm && c.tokenExpiraEm.getTime() - Date.now() > MARGEM_MS;

  const c = await ler();
  if (vigente(c)) return decifrar(c.accessTokenCifrado!);
  if (c.situacao !== "ativa" || !c.refreshTokenCifrado) {
    // sem refresh token (app sem offline_access) não há como renovar: mostra "Reconectar" em Canais
    if (c.situacao === "ativa") await marcarExpirada(c);
    throw new ErroMl(401, "reconectar", "Conexão sem autorização: conecte o Mercado Livre de novo.");
  }

  try {
    const t = await renovar(decifrar(c.refreshTokenCifrado));
    await db.update(conexoesCanal).set(camposToken(t, c.refreshTokenCifrado)).where(eq(conexoesCanal.id, conexaoId));
    return t.access_token;
  } catch (e) {
    if (!(e instanceof ErroMl) || e.codigo !== "invalid_grant") throw e;
    const depois = await ler();
    if (vigente(depois) && depois.accessTokenCifrado !== c.accessTokenCifrado) {
      return decifrar(depois.accessTokenCifrado!);
    }
    await marcarExpirada(c);
    throw new ErroMl(401, "reconectar", "O Mercado Livre recusou a renovação: conecte de novo.");
  }
}
