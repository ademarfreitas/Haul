// Amazon Selling Partner API (SP-API): autorização da conta, tokens LWA e chamadas.
// Docs: https://developer-docs.amazon.com/sp-api/docs/website-authorization-workflow
// - o vendedor autoriza em sellercentral.amazon.com.br/apps/authorize/consent e volta com spapi_oauth_code
//   (vale 5 minutos), que vira refresh token no Login with Amazon (api.amazon.com/auth/o2/token);
// - o refresh token não muda a cada renovação; o access token vale 1 h e vai no cabeçalho x-amz-access-token;
// - a autorização do vendedor vence em 1 ano: depois ele autoriza de novo (tarefa "reconectar canal").
// O Brasil fica na região América do Norte da SP-API (sellingpartnerapi-na).
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal, tarefas, usuarios } from "@/db/schema";
import { cifrar, decifrar } from "@/lib/cripto";

export const MARKETPLACE_BR = "A2Q3Y263D00KWC";
export const SELLER_CENTRAL = "https://sellercentral.amazon.com.br";
const URL_LWA = "https://api.amazon.com/auth/o2/token";
const HOSTS = {
  sandbox: "https://sandbox.sellingpartnerapi-na.amazon.com",
  producao: "https://sellingpartnerapi-na.amazon.com",
} as const;
const MARGEM_MS = 5 * 60 * 1000;
const TENTATIVAS_429 = 3;

type RespostaToken = { access_token: string; refresh_token?: string; expires_in: number; error?: string; error_description?: string };

export type Participacao = {
  marketplace: { id: string; countryCode: string; name: string };
  participation: { isParticipating: boolean };
  storeName?: string;
};

// cookie assinado que guarda o state entre /conectar e /callback
export const COOKIE_OAUTH_AMAZON = "plist_amazon_oauth";
export type EstadoOauthAmazon = { state: string; contaId: string; voltar: string };

export class ErroAmazon extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

// nomes (nunca valores) das variáveis da Amazon que faltam no ambiente
export function variaveisFaltandoAmazon(): string[] {
  return ["AMAZON_APP_ID", "AMAZON_LWA_CLIENT_ID", "AMAZON_LWA_CLIENT_SECRET", "AMAZON_REDIRECT_URI"].filter((n) => !process.env[n]?.trim());
}

function credenciais() {
  const appId = process.env.AMAZON_APP_ID;
  const clientId = process.env.AMAZON_LWA_CLIENT_ID;
  const clientSecret = process.env.AMAZON_LWA_CLIENT_SECRET;
  const redirectUri = process.env.AMAZON_REDIRECT_URI;
  if (!appId || !clientId || !clientSecret || !redirectUri) {
    throw new Error("AMAZON_APP_ID, AMAZON_LWA_CLIENT_ID, AMAZON_LWA_CLIENT_SECRET e AMAZON_REDIRECT_URI precisam estar no .env.local");
  }
  const host = (process.env.AMAZON_API_URL?.trim() || HOSTS[process.env.AMAZON_AMBIENTE === "sandbox" ? "sandbox" : "producao"]).replace(/\/+$/, "");
  return { appId, clientId, clientSecret, redirectUri, host };
}

// Página do pedido no Seller Central, onde o lojista compra e imprime a etiqueta (DBA ou envio próprio).
export const pedidoNoSellerCentral = (orderId: string) => `${SELLER_CENTRAL}/orders-v3/order/${encodeURIComponent(orderId)}`;

// Link da tela de consentimento no Seller Central. App ainda em rascunho (não publicado) precisa de version=beta.
export function urlAutorizacaoAmazon(state: string): string {
  const { appId, redirectUri } = credenciais();
  const p = new URLSearchParams({ application_id: appId, state, redirect_uri: redirectUri });
  if (process.env.AMAZON_APP_PUBLICADO !== "1") p.set("version", "beta");
  return `${SELLER_CENTRAL}/apps/authorize/consent?${p.toString()}`;
}

// Quem chega pela Appstore da Amazon passa antes pelo Login URI do app: devolvemos para a Amazon com o nosso state.
export function urlRetornoAppstore(amazonCallback: string, amazonState: string, state: string): string | null {
  let u: URL;
  try {
    u = new URL(amazonCallback);
  } catch {
    return null;
  }
  // só volta para domínio da Amazon
  if (u.protocol !== "https:" || !/(^|\.)amazon\.(com|com\.br)$/.test(u.hostname)) return null;
  u.searchParams.set("redirect_uri", credenciais().redirectUri);
  u.searchParams.set("amazon_state", amazonState);
  u.searchParams.set("state", state);
  if (process.env.AMAZON_APP_PUBLICADO !== "1") u.searchParams.set("version", "beta");
  return u.toString();
}

async function buscar(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new ErroAmazon(503, "amazon_indisponivel", "Não deu para falar com a Amazon agora.");
  }
}

async function pedirToken(corpo: Record<string, string>): Promise<RespostaToken> {
  const { clientId, clientSecret } = credenciais();
  const r = await buscar(URL_LWA, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ ...corpo, client_id: clientId, client_secret: clientSecret }),
  });
  // nunca registrar o corpo enviado: tem code, refresh token e secret
  const t = (await r.json().catch(() => ({}))) as RespostaToken;
  if (!r.ok || !t.access_token) {
    throw new ErroAmazon(r.status >= 500 ? 503 : 400, t.error || "token_vazio", t.error_description || "A Amazon não devolveu o token.");
  }
  return t;
}

export function trocarCodigoAmazon(code: string) {
  return pedirToken({ grant_type: "authorization_code", code, redirect_uri: credenciais().redirectUri });
}

function renovar(refreshToken: string) {
  return pedirToken({ grant_type: "refresh_token", refresh_token: refreshToken });
}

// Token sem vendedor (grantless), para as chamadas do próprio Plist, como criar o destino dos avisos.
export async function tokenSemVendedor(escopo: string): Promise<string> {
  return (await pedirToken({ grant_type: "client_credentials", scope: escopo })).access_token;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Chamada da SP-API. A Amazon limita bastante as chamadas por segundo: 429 espera e tenta de novo.
export async function chamarAmazon<T>(
  caminho: string,
  token: string,
  envio?: { metodo?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; consulta?: Record<string, string | number | undefined>; json?: unknown },
): Promise<T> {
  const { host } = credenciais();
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(envio?.consulta ?? {})) if (v !== undefined && v !== "") p.set(k, String(v));
  const url = `${host}${caminho}${p.size ? `?${p.toString()}` : ""}`;
  const metodo = envio?.metodo ?? (envio?.json !== undefined ? "POST" : "GET");

  for (let tentativa = 0; ; tentativa++) {
    const r = await buscar(url, {
      method: metodo,
      headers: {
        "x-amz-access-token": token,
        "user-agent": "Plist/1.0 (Language=TypeScript)",
        ...(envio?.json !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: envio?.json !== undefined ? JSON.stringify(envio.json) : undefined,
    });
    if (r.status === 429 && tentativa < TENTATIVAS_429) {
      await esperar(1000 * 2 ** tentativa + Math.random() * 500);
      continue;
    }
    const json = (await r.json().catch(() => ({}))) as T & { errors?: { code?: string; message?: string }[] };
    if (!r.ok) {
      const e = json.errors?.[0];
      throw new ErroAmazon(r.status, r.status === 429 ? "muitas_chamadas" : e?.code || "erro_desconhecido", e?.message || `API ${r.status}`);
    }
    return json;
  }
}

function camposToken(t: RespostaToken, refreshAnterior?: string) {
  return {
    accessTokenCifrado: cifrar(t.access_token),
    refreshTokenCifrado: cifrar(t.refresh_token ?? refreshAnterior ?? ""),
    tokenExpiraEm: new Date(Date.now() + t.expires_in * 1000),
    situacao: "ativa" as const,
  };
}

// A conta no Brasil (Amazon.com.br) entre as lojas em que o vendedor participa.
export async function participacaoBrasil(token: string): Promise<Participacao | null> {
  const r = await chamarAmazon<{ payload?: Participacao[] }>("/sellers/v1/marketplaceParticipations", token);
  return (r.payload ?? []).find((p) => p.marketplace.id === MARKETPLACE_BR && p.participation.isParticipating) ?? null;
}

// Grava (ou reconecta) a conta da Amazon na conta do Plist. Uma conta da Amazon pertence a uma só conta do Plist.
export async function salvarConexaoAmazon(contaId: string, vendedorId: string, t: RespostaToken, nome: string | null) {
  const db = obterDb();
  const [existente] = await db
    .select({ id: conexoesCanal.id, contaId: conexoesCanal.contaId })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.canal, "amazon"), eq(conexoesCanal.usuarioExterno, vendedorId)));

  if (existente && existente.contaId !== contaId) {
    // conta sem nenhum usuário ninguém mais acessa: a conexão muda de dono
    const [dono] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.contaId, existente.contaId)).limit(1);
    if (dono) throw new ErroAmazon(409, "conta_ja_conectada", "Esta conta da Amazon já está ligada a outra conta do Plist.");
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
    .values({ contaId, canal: "amazon", usuarioExterno: vendedorId, ...campos })
    .returning({ id: conexoesCanal.id });
  return nova.id;
}

export async function marcarExpiradaAmazon(conexao: { id: string; contaId: string; apelido: string | null }) {
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
      titulo: "Reconectar a Amazon",
      detalhe: `A conexão${conexao.apelido ? ` com ${conexao.apelido}` : ""} perdeu a autorização. Conecte de novo em Canais.`,
    });
  }
}

// Vendedor + access token válido para a conexão, renovando se estiver para vencer.
// Duas renovações ao mesmo tempo não se atrapalham (o refresh token da Amazon não muda), mas uma
// recusa só marca "expirada" depois de reler o banco, como no ML e na Shopee.
export async function contaAmazonValida(conexaoId: string): Promise<{ token: string; vendedorId: string }> {
  const db = obterDb();
  const ler = async () => {
    const [c] = await db.select().from(conexoesCanal).where(eq(conexoesCanal.id, conexaoId));
    if (!c || c.canal !== "amazon") throw new Error("conexão da Amazon não encontrada");
    return c;
  };
  const vigente = (c: Awaited<ReturnType<typeof ler>>) =>
    c.situacao === "ativa" && c.accessTokenCifrado && c.tokenExpiraEm && c.tokenExpiraEm.getTime() - Date.now() > MARGEM_MS;

  const c = await ler();
  const vendedorId = c.usuarioExterno;
  if (vigente(c)) return { token: decifrar(c.accessTokenCifrado!), vendedorId };
  if (c.situacao !== "ativa" || !c.refreshTokenCifrado) {
    throw new ErroAmazon(401, "reconectar", "Conexão sem autorização: conecte a Amazon de novo.");
  }

  const refresh = decifrar(c.refreshTokenCifrado);
  try {
    const t = await renovar(refresh);
    await db.update(conexoesCanal).set(camposToken(t, refresh)).where(eq(conexoesCanal.id, conexaoId));
    return { token: t.access_token, vendedorId };
  } catch (e) {
    // erro de rede ou da Amazon fora do ar não derruba a conexão
    if (!(e instanceof ErroAmazon) || e.status >= 500) throw e;
    const depois = await ler();
    if (vigente(depois) && depois.accessTokenCifrado !== c.accessTokenCifrado) {
      return { token: decifrar(depois.accessTokenCifrado!), vendedorId };
    }
    await marcarExpiradaAmazon(c);
    throw new ErroAmazon(401, "reconectar", "A Amazon recusou a renovação: conecte de novo.");
  }
}

// Assina os avisos de pedido (ORDER_CHANGE) desta conta no destino SQS do Plist, se ele estiver configurado.
// Melhor esforço: sem avisos, os pedidos chegam pelo botão Atualizar pedidos.
export async function assinarAvisosAmazon(token: string): Promise<void> {
  const destinationId = process.env.AMAZON_DESTINO_AVISOS?.trim();
  if (!destinationId) return;
  try {
    await chamarAmazon("/notifications/v1/subscriptions/ORDER_CHANGE", token, {
      json: { payloadVersion: "1.0", destinationId, processingDirective: { eventFilter: { eventFilterType: "ORDER_CHANGE", orderChangeTypes: ["OrderStatusChange"], marketplaceIds: [MARKETPLACE_BR] } } },
    });
  } catch (e) {
    // 409: esta conta já tem a assinatura
    if (!(e instanceof ErroAmazon && e.status === 409)) console.error("assinar avisos Amazon falhou:", e instanceof ErroAmazon ? e.codigo : e);
  }
}
