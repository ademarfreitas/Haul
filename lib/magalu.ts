// API aberta da Magalu (developers.magalu.com): autorização pelo ID Magalu, tokens e chamadas.
// Docs: /docs/first-steps/create-an-application/authentication-authorization e /docs/first-steps/environment
// - o lojista autoriza em id.magalu.com/login (escolhe a loja com choose_tenants=true) e volta com ?code=&state=;
// - o code vale 10 minutos e é trocado em id.magalu.com/oauth/token (JSON); a renovação vai no mesmo endereço, em formulário;
// - access token vale até 2 h; o refresh devolve um refresh token novo, que tem de ser salvo (o antigo não serve mais);
// - a loja é o "tenant": vem de GET /seller/v1/portfolios/me e vai em usuario_externo.
// Sem PKCE documentado: o state fica num cookie assinado, como na Shopee.
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal, tarefas, usuarios } from "@/db/schema";
import { cifrar, decifrar } from "@/lib/cripto";

const URL_ID = "https://id.magalu.com";
const HOSTS = {
  sandbox: "https://api-sandbox.magalu.com",
  producao: "https://api.magalu.com",
} as const;
// canal de venda Magazine Luiza (docs: development-guide/sales-channel-id e apis/sandbox/overview)
const CANAL_VENDA = {
  sandbox: "5f62650a-0039-4d65-9b96-266d498c03bd",
  producao: "9fe0d853-732b-4e4a-a0b0-cff988ed043d",
} as const;
const MARGEM_MS = 5 * 60 * 1000;

// Permissões pedidas ao lojista. Precisam estar também no client criado com o `idm` (docs/magalu.md).
export const ESCOPOS_MAGALU = [
  "open:portfolio-skus-seller:read",
  "open:portfolio-skus-seller:write",
  "open:portfolio-prices-seller:read",
  "open:portfolio-prices-seller:write",
  "open:portfolio-stocks-seller:read",
  "open:portfolio-stocks-seller:write",
  "open:order-order-seller:read",
  "open:order-delivery-seller:read",
  "open:order-delivery-seller:write",
  "open:order-invoice-seller:read",
  "open:order-logistics-seller:read",
  "open:order-logistics-seller:write",
];

type RespostaToken = { access_token: string; refresh_token: string; expires_in?: number };

// GET /seller/v1/portfolios/me
export type LojaMagalu = { tenant?: { id?: string }; seller?: { id?: string; name?: string }; channel?: { id?: string; name?: string } };

export type Loja = { accessToken: string; tenant: string };

export const COOKIE_OAUTH_MAGALU = "plist_magalu_oauth";
export type EstadoOauthMagalu = { state: string; contaId: string; voltar: string };

export class ErroMagalu extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export function variaveisFaltandoMagalu(): string[] {
  return ["MAGALU_CLIENT_ID", "MAGALU_CLIENT_SECRET", "MAGALU_REDIRECT_URI"].filter((n) => !process.env[n]?.trim());
}

function ambiente() {
  return process.env.MAGALU_AMBIENTE === "producao" ? ("producao" as const) : ("sandbox" as const);
}

function credenciais() {
  const clientId = process.env.MAGALU_CLIENT_ID;
  const clientSecret = process.env.MAGALU_CLIENT_SECRET;
  const redirectUri = process.env.MAGALU_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("MAGALU_CLIENT_ID, MAGALU_CLIENT_SECRET e MAGALU_REDIRECT_URI precisam estar no .env.local");
  }
  const host = (process.env.MAGALU_API_URL?.trim() || HOSTS[ambiente()]).replace(/\/+$/, "");
  return { clientId, clientSecret, redirectUri, host };
}

export const emSandboxMagalu = () => ambiente() === "sandbox";
export const canalVendaMagalu = () => CANAL_VENDA[ambiente()];

export function urlAutorizacaoMagalu(state: string): string {
  const { clientId, redirectUri } = credenciais();
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: ESCOPOS_MAGALU.join(" "),
    response_type: "code",
    choose_tenants: "true",
    state,
  });
  return `${URL_ID}/login?${p.toString()}`;
}

async function buscar(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new ErroMagalu(503, "magalu_indisponivel", "Não deu para falar com a Magalu agora.");
  }
}

// Erro da Magalu: { slug, message, details: [{ field, message }] }. Os campos recusados vão na mensagem,
// para o lojista (e quem estiver ajustando a integração) ver o que corrigir.
type CorpoErro = { slug?: string; message?: string; error?: string; error_description?: string; details?: { field?: string; message?: string }[] };

async function erroDa(r: Response): Promise<ErroMagalu> {
  const j = (await r.json().catch(() => ({}))) as CorpoErro;
  const campos = (j.details ?? [])
    .map((d) => [d.field, d.message].filter(Boolean).join(": "))
    .filter(Boolean)
    .slice(0, 5)
    .join("; ");
  const base = j.message || j.error_description || `API ${r.status}`;
  return new ErroMagalu(r.status, j.slug || j.error || `http_${r.status}`, campos ? `${base} (${campos})` : base);
}

async function pedirToken(corpo: Record<string, string>, formulario: boolean): Promise<RespostaToken> {
  const r = await buscar(`${URL_ID}/oauth/token`, {
    method: "POST",
    headers: { "content-type": formulario ? "application/x-www-form-urlencoded" : "application/json", accept: "application/json" },
    body: formulario ? new URLSearchParams(corpo).toString() : JSON.stringify(corpo),
  });
  // nunca registrar o corpo: tem code, secret ou refresh_token
  if (!r.ok) throw await erroDa(r);
  const t = (await r.json()) as RespostaToken;
  if (!t.access_token) throw new ErroMagalu(400, "token_vazio", "A Magalu não devolveu o token.");
  return t;
}

export function trocarCodigoMagalu(code: string) {
  const { clientId, clientSecret, redirectUri } = credenciais();
  return pedirToken({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }, false);
}

function renovar(refreshToken: string) {
  const { clientId, clientSecret } = credenciais();
  return pedirToken({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }, true);
}

// Chamada da loja. `consulta` vira query string; `json` vai no corpo. 202 (preço, estoque e SKU são
// processados depois) e 204 voltam sem corpo. 429 espera e tenta mais duas vezes.
export async function chamarMagalu<T>(
  caminho: string,
  accessToken: string,
  envio?: { metodo?: "GET" | "POST" | "PUT" | "PATCH"; consulta?: Record<string, string | number>; json?: unknown },
): Promise<T> {
  const { host } = credenciais();
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(envio?.consulta ?? {})) p.set(k, String(v));
  const url = `${host}${caminho}${p.size ? `?${p.toString()}` : ""}`;
  const metodo = envio?.metodo ?? (envio?.json !== undefined ? "POST" : "GET");
  for (let tentativa = 0; ; tentativa++) {
    const r = await buscar(url, {
      method: metodo,
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        ...(envio?.json !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: envio?.json !== undefined ? JSON.stringify(envio.json) : undefined,
    });
    if (r.status === 429 && tentativa < 2) {
      await new Promise((ok) => setTimeout(ok, 1000 * 2 ** tentativa));
      continue;
    }
    if (!r.ok) throw await erroDa(r);
    const texto = await r.text();
    return (texto ? JSON.parse(texto) : {}) as T;
  }
}

// Sandbox: cria (ou devolve) a loja de teste ligada ao tenant que autorizou. Em produção não faz nada.
export async function prepararSandboxMagalu(accessToken: string): Promise<void> {
  if (!emSandboxMagalu()) return;
  await chamarMagalu("/v1/samples/onboarding", accessToken, { metodo: "PUT", json: { channel_id: canalVendaMagalu() } }).catch((e) => {
    // já feito antes também cai aqui; o /portfolios/me logo depois diz se a loja existe
    console.error("onboarding do sandbox da Magalu:", e instanceof ErroMagalu ? e.codigo : e);
  });
}

// Aviso (webhook v1): X-Signature-256 = "sha256=" + HMAC-SHA256(segredo, `${X-Timestamp}.${corpo}`).
// Na troca do segredo pode vir mais de uma assinatura separada por vírgula: vale qualquer uma.
export function avisoAutenticoMagalu(corpo: string, assinatura: string | null, timestamp: string | null): boolean {
  const segredo = process.env.MAGALU_WEBHOOK_SECRET;
  if (!segredo || !assinatura || !timestamp) return false;
  // aviso de mais de 5 minutos não vale: evita reenvio de um aviso antigo capturado
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const esperado = Buffer.from(`sha256=${createHmac("sha256", segredo).update(`${timestamp}.${corpo}`).digest("hex")}`);
  return assinatura.split(",").some((a) => {
    const b = Buffer.from(a.trim());
    return b.length === esperado.length && timingSafeEqual(b, esperado);
  });
}

function camposToken(t: RespostaToken, refreshAnterior?: string) {
  return {
    accessTokenCifrado: cifrar(t.access_token),
    // se a renovação não trouxer refresh novo, o anterior continua valendo
    refreshTokenCifrado: t.refresh_token ? cifrar(t.refresh_token) : refreshAnterior,
    tokenExpiraEm: new Date(Date.now() + (t.expires_in ?? 7200) * 1000),
    situacao: "ativa" as const,
  };
}

// Grava (ou reconecta) a loja da Magalu na conta do Plist. Uma loja pertence a uma só conta do Plist.
export async function salvarConexaoMagalu(contaId: string, tenant: string, t: RespostaToken, nome: string | null) {
  const db = obterDb();
  const [existente] = await db
    .select({ id: conexoesCanal.id, contaId: conexoesCanal.contaId })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.canal, "magalu"), eq(conexoesCanal.usuarioExterno, tenant)));

  if (existente && existente.contaId !== contaId) {
    // conta sem nenhum usuário ninguém mais acessa: a conexão muda de dono
    const [dono] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.contaId, existente.contaId)).limit(1);
    if (dono) throw new ErroMagalu(409, "conta_ja_conectada", "Esta loja da Magalu já está ligada a outra conta do Plist.");
    await db.update(conexoesCanal).set({ contaId }).where(eq(conexoesCanal.id, existente.id));
    await db.update(tarefas).set({ contaId }).where(eq(tarefas.conexaoId, existente.id));
  }

  const campos = { ...camposToken(t), apelido: nome };
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
    .values({ contaId, canal: "magalu", usuarioExterno: tenant, ...campos })
    .returning({ id: conexoesCanal.id });
  return nova.id;
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
      titulo: "Reconectar a Magalu",
      detalhe: `A conexão${conexao.apelido ? ` com ${conexao.apelido}` : ""} perdeu a autorização. Conecte de novo em Canais.`,
    });
  }
}

// Loja + access token válido, renovando se estiver para vencer.
// Mesma regra do ML e da Shopee para duas renovações ao mesmo tempo: relê o banco antes de marcar "expirada".
export async function lojaMagaluValida(conexaoId: string): Promise<Loja> {
  const db = obterDb();
  const ler = async () => {
    const [c] = await db.select().from(conexoesCanal).where(eq(conexoesCanal.id, conexaoId));
    if (!c || c.canal !== "magalu") throw new Error("conexão da Magalu não encontrada");
    return c;
  };
  const vigente = (c: Awaited<ReturnType<typeof ler>>) =>
    c.situacao === "ativa" && c.accessTokenCifrado && c.tokenExpiraEm && c.tokenExpiraEm.getTime() - Date.now() > MARGEM_MS;

  const c = await ler();
  if (vigente(c)) return { accessToken: decifrar(c.accessTokenCifrado!), tenant: c.usuarioExterno };
  if (c.situacao !== "ativa" || !c.refreshTokenCifrado) {
    throw new ErroMagalu(401, "reconectar", "Conexão sem autorização: conecte a Magalu de novo.");
  }

  try {
    const t = await renovar(decifrar(c.refreshTokenCifrado));
    await db.update(conexoesCanal).set(camposToken(t, c.refreshTokenCifrado)).where(eq(conexoesCanal.id, conexaoId));
    return { accessToken: t.access_token, tenant: c.usuarioExterno };
  } catch (e) {
    if (!(e instanceof ErroMagalu) || e.status >= 500) throw e;
    const depois = await ler();
    if (vigente(depois) && depois.accessTokenCifrado !== c.accessTokenCifrado) {
      return { accessToken: decifrar(depois.accessTokenCifrado!), tenant: depois.usuarioExterno };
    }
    await marcarExpirada(c);
    throw new ErroMagalu(401, "reconectar", "A Magalu recusou a renovação: conecte de novo.");
  }
}

// O SKU do lojista é o id do anúncio na Magalu, mas só é único dentro da loja; no Plist o anúncio
// guarda "<tenant>/<sku>" para duas lojas com o mesmo SKU não se confundirem.
export const idAnuncioMagalu = (tenant: string, sku: string) => `${tenant}/${sku}`;
export const skuDoAnuncioMagalu = (idExterno: string) => idExterno.slice(idExterno.indexOf("/") + 1);

// Quantidade à venda no canal Magalu. Sem pausa na API: tirar do ar é zerar o estoque.
export async function mudarEstoqueMagalu(accessToken: string, sku: string, quantidade: number): Promise<void> {
  await chamarMagalu(`/seller/v1/portfolios/stocks/${encodeURIComponent(sku)}`, accessToken, {
    metodo: "PATCH",
    json: { channel: { id: canalVendaMagalu() }, type: "AVAILABLE", quantity: Math.max(0, quantidade) },
  });
}
