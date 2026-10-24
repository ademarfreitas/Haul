// Shopee Open Platform v2: autorização da loja, tokens e chamadas assinadas.
// Docs: https://open.shopee.com/developer-guide/20 (autorização) e /developer-guide/16 (assinatura)
// - toda chamada leva sign = HMAC-SHA256(partner_key, partner_id + caminho + timestamp [+ access_token + shop_id]);
// - access token vale ~4 h; refresh token vale ~30 dias e cada renovação devolve um novo, que tem de ser salvo;
// - a autorização da loja vence em até 1 ano: depois o lojista autoriza de novo (tarefa "reconectar canal").
// A Shopee não tem PKCE nem "state": o state vai na própria URL de retorno e é conferido no callback.
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal, tarefas, usuarios } from "@/db/schema";
import { cifrar, decifrar } from "@/lib/cripto";

// Hosts da API. O console da Shopee mostra o host certo de cada app: se for outro, SHOPEE_API_URL manda.
const HOSTS = {
  sandbox: "https://openplatform.sandbox.test-stable.shopee.sg",
  producao: "https://openplatform.shopee.com.br",
} as const;
const MARGEM_MS = 5 * 60 * 1000;

type RespostaToken = {
  access_token: string;
  refresh_token: string;
  expire_in: number;
  error?: string;
  message?: string;
};

export type LojaShopee = { shop_name: string; region: string; status: string };

// cookie assinado que guarda o state entre /conectar e /callback
export const COOKIE_OAUTH_SHOPEE = "plist_shopee_oauth";
export type EstadoOauthShopee = { state: string; contaId: string; voltar: string };

export class ErroShopee extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

// nomes (nunca valores) das variáveis da Shopee que faltam no ambiente
export function variaveisFaltandoShopee(): string[] {
  return ["SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY", "SHOPEE_REDIRECT_URI"].filter((n) => !process.env[n]?.trim());
}

function credenciais() {
  const partnerId = Number(process.env.SHOPEE_PARTNER_ID);
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const redirectUri = process.env.SHOPEE_REDIRECT_URI;
  if (!partnerId || !partnerKey || !redirectUri) {
    throw new Error("SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY e SHOPEE_REDIRECT_URI precisam estar no .env.local");
  }
  const ambiente = process.env.SHOPEE_AMBIENTE === "producao" ? "producao" : "sandbox";
  const host = (process.env.SHOPEE_API_URL?.trim() || HOSTS[ambiente]).replace(/\/+$/, "");
  return { partnerId, partnerKey, redirectUri, host };
}

function assinar(partnerKey: string, base: string): string {
  return createHmac("sha256", partnerKey).update(base).digest("hex");
}

// parâmetros públicos de toda chamada: partner_id, timestamp e sign (com access_token e shop_id nas da loja)
function parametrosAssinados(caminho: string, loja?: { accessToken: string; shopId: number }) {
  const { partnerId, partnerKey } = credenciais();
  const timestamp = Math.floor(Date.now() / 1000);
  const base = `${partnerId}${caminho}${timestamp}${loja ? `${loja.accessToken}${loja.shopId}` : ""}`;
  const p = new URLSearchParams({ partner_id: String(partnerId), timestamp: String(timestamp), sign: assinar(partnerKey, base) });
  if (loja) {
    p.set("access_token", loja.accessToken);
    p.set("shop_id", String(loja.shopId));
  }
  return p;
}

// Link da tela de autorização da Shopee. O state vai na URL de retorno, que a Shopee devolve com code e shop_id.
export function urlAutorizacaoShopee(state: string): string {
  const { host, redirectUri } = credenciais();
  const caminho = "/api/v2/shop/auth_partner";
  const volta = new URL(redirectUri);
  volta.searchParams.set("state", state);
  const p = parametrosAssinados(caminho);
  p.set("redirect", volta.toString());
  return `${host}${caminho}?${p.toString()}`;
}

async function buscar(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ErroShopee(503, "shopee_indisponivel", "Não deu para falar com a Shopee agora.");
  }
}

// A Shopee responde erro às vezes com HTTP 200: o que vale é o campo "error" preenchido.
async function lerResposta<T>(r: Response): Promise<T> {
  const json = (await r.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!r.ok || json.error) {
    throw new ErroShopee(r.ok ? 400 : r.status, json.error || "erro_desconhecido", json.message || `API ${r.status}`);
  }
  return json;
}

async function pedirToken(caminho: string, corpo: Record<string, unknown>): Promise<RespostaToken> {
  const { host, partnerId } = credenciais();
  const r = await buscar(`${host}${caminho}?${parametrosAssinados(caminho).toString()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...corpo, partner_id: partnerId }),
  });
  // nunca registrar o corpo enviado: tem code ou refresh_token
  const t = await lerResposta<RespostaToken>(r);
  if (!t.access_token) throw new ErroShopee(400, "token_vazio", "A Shopee não devolveu o token.");
  return t;
}

export function trocarCodigoShopee(code: string, shopId: number) {
  return pedirToken("/api/v2/auth/token/get", { code, shop_id: shopId });
}

function renovar(refreshToken: string, shopId: number) {
  return pedirToken("/api/v2/auth/access_token/get", { refresh_token: refreshToken, shop_id: shopId });
}

// Chamada de loja assinada. GET com `consulta`; POST com `json`.
export async function chamarShopee<T>(
  caminho: string,
  loja: { accessToken: string; shopId: number },
  envio?: { consulta?: Record<string, string | number>; json?: unknown },
): Promise<T> {
  const { host } = credenciais();
  const p = parametrosAssinados(caminho, loja);
  for (const [k, v] of Object.entries(envio?.consulta ?? {})) p.set(k, String(v));
  const r = await buscar(`${host}${caminho}?${p.toString()}`, {
    method: envio?.json !== undefined ? "POST" : "GET",
    headers: envio?.json !== undefined ? { "content-type": "application/json" } : undefined,
    body: envio?.json !== undefined ? JSON.stringify(envio.json) : undefined,
  });
  return lerResposta<T>(r);
}

// Envia uma foto para o espaço de mídia da Shopee (chamada da plataforma, assinada sem loja).
// Devolve o image_id (vai no add_item) e o endereço da foto (fica na peça do Plist).
export async function enviarImagemShopee(arquivo: Blob, nome: string): Promise<{ id: string; url: string }> {
  const { host } = credenciais();
  const caminho = "/api/v2/media_space/upload_image";
  const form = new FormData();
  form.append("image", arquivo, nome);
  const r = await buscar(`${host}${caminho}?${parametrosAssinados(caminho).toString()}`, { method: "POST", body: form });
  const j = await lerResposta<{ response?: { image_info?: { image_id?: string; image_url_list?: { image_url_region?: string; image_url?: string }[] } } }>(r);
  const info = j.response?.image_info;
  if (!info?.image_id) throw new ErroShopee(502, "foto_sem_id", "A Shopee não devolveu a foto.");
  const urls = info.image_url_list ?? [];
  const url = (urls.find((u) => u.image_url_region === "BR") ?? urls[0])?.image_url ?? "";
  return { id: info.image_id, url };
}

// POST que devolve arquivo (ex.: PDF da etiqueta). Se a Shopee responder JSON, é erro.
export async function baixarShopee(caminho: string, loja: { accessToken: string; shopId: number }, json: unknown): Promise<Response> {
  const { host } = credenciais();
  const r = await buscar(`${host}${caminho}?${parametrosAssinados(caminho, loja).toString()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(json),
  });
  if (!r.ok || (r.headers.get("content-type") ?? "").includes("application/json")) {
    await lerResposta(r);
    throw new ErroShopee(502, "sem_arquivo", "A Shopee não devolveu o arquivo.");
  }
  return r;
}

// Confere a assinatura de um aviso (push): Authorization = HMAC-SHA256(partner_key, url + "|" + corpo).
export function avisoAutentico(url: string, corpo: string, autorizacao: string | null): boolean {
  if (!autorizacao) return false;
  const { partnerKey } = credenciais();
  const esperado = assinar(partnerKey, `${url}|${corpo}`);
  return esperado.length === autorizacao.length && timingSafeEqual(Buffer.from(esperado), Buffer.from(autorizacao));
}

function camposToken(t: RespostaToken) {
  return {
    accessTokenCifrado: cifrar(t.access_token),
    refreshTokenCifrado: cifrar(t.refresh_token),
    tokenExpiraEm: new Date(Date.now() + t.expire_in * 1000),
    situacao: "ativa" as const,
  };
}

// Grava (ou reconecta) a loja da Shopee na conta do Plist. Uma loja pertence a uma só conta do Plist.
export async function salvarConexaoShopee(contaId: string, shopId: number, t: RespostaToken, loja: LojaShopee) {
  const db = obterDb();
  const usuarioExterno = String(shopId);
  const [existente] = await db
    .select({ id: conexoesCanal.id, contaId: conexoesCanal.contaId })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.canal, "shopee"), eq(conexoesCanal.usuarioExterno, usuarioExterno)));

  if (existente && existente.contaId !== contaId) {
    // conta sem nenhum usuário ninguém mais acessa: a conexão muda de dono
    const [dono] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.contaId, existente.contaId)).limit(1);
    if (dono) throw new ErroShopee(409, "conta_ja_conectada", "Esta loja da Shopee já está ligada a outra conta do Plist.");
    await db.update(conexoesCanal).set({ contaId }).where(eq(conexoesCanal.id, existente.id));
    await db.update(tarefas).set({ contaId }).where(eq(tarefas.conexaoId, existente.id));
  }

  const campos = { ...camposToken(t), apelido: loja.shop_name };
  if (existente) {
    await db.update(conexoesCanal).set(campos).where(eq(conexoesCanal.id, existente.id));
    await db
      .update(tarefas)
      .set({ situacao: "concluida", concluidaEm: new Date() })
      .where(and(eq(tarefas.conexaoId, existente.id), eq(tarefas.tipo, "reconectar_canal"), eq(tarefas.situacao, "aberta")));
    return existente.id;
  }
  const [nova] = await db
    .insert(conexoesCanal)
    .values({ contaId, canal: "shopee", usuarioExterno, ...campos })
    .returning({ id: conexoesCanal.id });
  return nova.id;
}

export async function marcarExpiradaShopee(conexao: { id: string; contaId: string; apelido: string | null }) {
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
      titulo: "Reconectar a Shopee",
      detalhe: `A conexão${conexao.apelido ? ` com ${conexao.apelido}` : ""} perdeu a autorização. Conecte de novo em Canais.`,
    });
  }
}

// Loja + access token válido para a conexão, renovando se estiver para vencer.
// Mesma regra do ML para duas renovações ao mesmo tempo: relê o banco antes de marcar "expirada".
export async function lojaValida(conexaoId: string): Promise<{ accessToken: string; shopId: number }> {
  const db = obterDb();
  const ler = async () => {
    const [c] = await db.select().from(conexoesCanal).where(eq(conexoesCanal.id, conexaoId));
    if (!c || c.canal !== "shopee") throw new Error("conexão da Shopee não encontrada");
    return c;
  };
  const vigente = (c: Awaited<ReturnType<typeof ler>>) =>
    c.situacao === "ativa" && c.accessTokenCifrado && c.tokenExpiraEm && c.tokenExpiraEm.getTime() - Date.now() > MARGEM_MS;

  const c = await ler();
  const shopId = Number(c.usuarioExterno);
  if (vigente(c)) return { accessToken: decifrar(c.accessTokenCifrado!), shopId };
  if (c.situacao !== "ativa" || !c.refreshTokenCifrado) {
    throw new ErroShopee(401, "reconectar", "Conexão sem autorização: conecte a Shopee de novo.");
  }

  try {
    const t = await renovar(decifrar(c.refreshTokenCifrado), shopId);
    await db.update(conexoesCanal).set(camposToken(t)).where(eq(conexoesCanal.id, conexaoId));
    return { accessToken: t.access_token, shopId };
  } catch (e) {
    // erro de rede ou da Shopee fora do ar não derruba a conexão
    if (!(e instanceof ErroShopee) || e.status >= 500) throw e;
    const depois = await ler();
    if (vigente(depois) && depois.accessTokenCifrado !== c.accessTokenCifrado) {
      return { accessToken: decifrar(depois.accessTokenCifrado!), shopId };
    }
    await marcarExpiradaShopee(c);
    throw new ErroShopee(401, "reconectar", "A Shopee recusou a renovação: conecte de novo.");
  }
}
