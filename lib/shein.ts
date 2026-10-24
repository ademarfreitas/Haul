// SHEIN Open Platform: autorização da loja, chaves e chamadas assinadas.
// Docs: https://open.sheincorp.com (o portal só abre com login). Conferido com dois clientes abertos que
// usam a API: github.com/XIE7654/shein_spi e github.com/fangwater/shein_manager.
// - o lojista autoriza na página "empower" da Shein, que volta com ?tempToken=...&state=... (vale 10 min);
// - /open-api/auth/get-by-token troca o tempToken pelo openKeyId e pela secretKey da loja. A secretKey vem
//   cifrada (AES-128-CBC, chave = 16 primeiros bytes do App Secret, IV = "space-station-de");
// - as chaves da loja não vencem: valem até o lojista tirar a autorização na Shein;
// - toda chamada leva x-lt-openKeyId, x-lt-timestamp (ms) e x-lt-signature, que é
//   aleatório(5) + base64(hex(HMAC-SHA256(secretKey + aleatório, "<openKeyId>&<timestamp>&<caminho>")));
//   a troca do tempToken assina igual, com App ID e App Secret no lugar das chaves da loja.
// A Shein responde { code, msg, info }: só code "0" é sucesso, mesmo com HTTP 200.
import { createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal, tarefas, usuarios } from "@/db/schema";
import { cifrar, decifrar } from "@/lib/cripto";

// Hosts. O console da Shein mostra os do app: se forem outros, SHEIN_API_URL e SHEIN_AUTH_URL mandam.
const HOSTS = {
  teste: { api: "https://openapi-test01.sheincorp.cn", auth: "https://openapi-sem-test01.dotfashion.cn/#/empower" },
  producao: { api: "https://openapi.sheincorp.com", auth: "https://openapi-sem.sheincorp.com/#/empower" },
} as const;

// Caminhos que os clientes abertos não deixam 100% claros para o vendedor brasileiro (modo "plataforma").
// Ficam juntos aqui para conferir no primeiro teste e trocar num lugar só.
export const CAMINHOS_SHEIN = {
  loja: "/open-api/openapi-business-backend/query-store-info",
  produtos: "/open-api/goods/searchProduct",
  produto: "/open-api/goods/spu-info",
  estoque: "/open-api/gsp/goods/change-inventory",
  vitrine: "/open-api/goods/modify-skc-shelf",
  pedidos: "/open-api/order/order-list",
  pedido: "/open-api/order/order-detail",
  etiqueta: "/open-api/order/print-express-info",
  categorias: "/open-api/goods/query-category-tree",
  atributos: "/open-api/goods/query-attribute-template",
  marcas: "/open-api/goods/query-brand-list",
  sites: "/open-api/goods/query-site-list",
  foto: "/open-api/goods/transform-pic",
  publicar: "/open-api/goods/product/publishOrEdit",
} as const;

export type ChavesShein = { openKeyId: string; secretKey: string };
export type LojaShein = { nome: string; fornecedor: string | null };

// cookie assinado que guarda o state entre /conectar e /callback
export const COOKIE_OAUTH_SHEIN = "plist_shein_oauth";
export type EstadoOauthShein = { state: string; contaId: string; voltar: string };

export class ErroShein extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

// nomes (nunca valores) das variáveis da Shein que faltam no ambiente
export function variaveisFaltandoShein(): string[] {
  return ["SHEIN_APP_ID", "SHEIN_APP_SECRET", "SHEIN_REDIRECT_URI"].filter((n) => !process.env[n]?.trim());
}

function ambiente() {
  const qual = process.env.SHEIN_AMBIENTE === "producao" ? "producao" : "teste";
  return {
    api: (process.env.SHEIN_API_URL?.trim() || HOSTS[qual].api).replace(/\/+$/, ""),
    auth: process.env.SHEIN_AUTH_URL?.trim() || HOSTS[qual].auth,
  };
}

function app() {
  const appId = process.env.SHEIN_APP_ID;
  const appSecret = process.env.SHEIN_APP_SECRET;
  const redirectUri = process.env.SHEIN_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    throw new Error("SHEIN_APP_ID, SHEIN_APP_SECRET e SHEIN_REDIRECT_URI precisam estar no .env.local");
  }
  return { appId, appSecret, redirectUri };
}

const LETRAS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function assinar(keyId: string, segredo: string, caminho: string, timestamp: string): string {
  const aleatorio = Array.from(randomBytes(5), (b) => LETRAS[b % LETRAS.length]).join("");
  const hex = createHmac("sha256", segredo + aleatorio).update(`${keyId}&${timestamp}&${caminho}`).digest("hex");
  return aleatorio + Buffer.from(hex).toString("base64");
}

// Link da página de autorização da Shein. O endereço de volta vai em base64.
export function urlAutorizacaoShein(state: string): string {
  const { appId, redirectUri } = app();
  const p = new URLSearchParams({ appid: appId, redirectUrl: Buffer.from(redirectUri).toString("base64"), state });
  return `${ambiente().auth}?${p.toString()}`;
}

async function buscar(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new ErroShein(503, "shein_indisponivel", "Não deu para falar com a Shein agora.");
  }
}

type Envelope<T> = { code?: string | number; msg?: string; info?: T };

async function lerResposta<T>(r: Response): Promise<T> {
  const json = (await r.json().catch(() => ({}))) as Envelope<T>;
  if (r.status === 401 || r.status === 403) throw new ErroShein(401, "reconectar", "A Shein recusou as chaves da loja.");
  if (!r.ok) throw new ErroShein(r.status >= 500 ? 503 : r.status, "erro_http", json.msg || `API ${r.status}`);
  if (String(json.code) !== "0") throw new ErroShein(400, String(json.code ?? "erro_desconhecido"), json.msg || "A Shein recusou o pedido.");
  return json.info as T;
}

function cabecalhos(caminho: string, quem: { id: string; segredo: string; app?: boolean }): Record<string, string> {
  const timestamp = String(Date.now());
  return {
    "content-type": "application/json;charset=UTF-8",
    accept: "application/json",
    language: "pt-br",
    "x-lt-timestamp": timestamp,
    [quem.app ? "x-lt-appid" : "x-lt-openKeyId"]: quem.id,
    "x-lt-signature": assinar(quem.id, quem.segredo, caminho, timestamp),
  };
}

// AES-128-CBC com os 16 primeiros bytes do App Secret e o IV fixo da Shein.
function decifrarSecretKey(cifrada: string, appSecret: string): string {
  const chave = Buffer.alloc(16);
  Buffer.from(appSecret, "utf8").copy(chave, 0, 0, 16);
  const d = createDecipheriv("aes-128-cbc", chave, Buffer.from("space-station-de", "utf8"));
  return Buffer.concat([d.update(Buffer.from(cifrada, "base64")), d.final()]).toString("utf8");
}

export async function trocarTempToken(tempToken: string): Promise<ChavesShein> {
  const { appId, appSecret } = app();
  const caminho = "/open-api/auth/get-by-token";
  const r = await buscar(`${ambiente().api}${caminho}`, {
    method: "POST",
    headers: cabecalhos(caminho, { id: appId, segredo: appSecret, app: true }),
    body: JSON.stringify({ tempToken }),
  });
  // nunca registrar a resposta: tem a secretKey
  const info = await lerResposta<{ openKeyId?: string; secretKey?: string }>(r);
  if (!info?.openKeyId || !info.secretKey) throw new ErroShein(400, "sem_chaves", "A Shein não devolveu as chaves da loja.");
  try {
    return { openKeyId: info.openKeyId, secretKey: decifrarSecretKey(info.secretKey, appSecret) };
  } catch {
    throw new ErroShein(400, "chave_ilegivel", "Não deu para abrir a chave da loja: confira o SHEIN_APP_SECRET.");
  }
}

// Chamada da loja assinada. POST com `json` (o padrão da Shein); GET com `consulta`.
export async function chamarShein<T>(
  caminho: string,
  chaves: ChavesShein,
  envio?: { json?: unknown; consulta?: Record<string, string | number> },
): Promise<T> {
  const url = new URL(`${ambiente().api}${caminho}`);
  for (const [k, v] of Object.entries(envio?.consulta ?? {})) url.searchParams.set(k, String(v));
  const get = envio?.consulta !== undefined && envio.json === undefined;
  const r = await buscar(url.toString(), {
    method: get ? "GET" : "POST",
    headers: cabecalhos(caminho, { id: chaves.openKeyId, segredo: chaves.secretKey }),
    body: get ? undefined : JSON.stringify(envio?.json ?? {}),
  });
  return lerResposta<T>(r);
}

// Nome da loja e código de fornecedor. A resposta varia entre contas: pega o primeiro campo que existir.
export async function lojaShein(chaves: ChavesShein): Promise<LojaShein> {
  const info = await chamarShein<Record<string, unknown> | null>(CAMINHOS_SHEIN.loja, chaves);
  const texto = (...nomes: string[]) => {
    for (const n of nomes) {
      const v = info?.[n];
      if (typeof v === "string" || typeof v === "number") return String(v);
    }
    return null;
  };
  return { nome: texto("storeName", "shopName", "supplierName") ?? "Loja Shein", fornecedor: texto("supplierId", "supplierCode") };
}

// Grava (ou reconecta) a loja da Shein na conta do Plist. O openKeyId identifica a autorização da loja.
export async function salvarConexaoShein(contaId: string, chaves: ChavesShein, loja: LojaShein) {
  const db = obterDb();
  const usuarioExterno = chaves.openKeyId;
  const [existente] = await db
    .select({ id: conexoesCanal.id, contaId: conexoesCanal.contaId })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.canal, "shein"), eq(conexoesCanal.usuarioExterno, usuarioExterno)));

  if (existente && existente.contaId !== contaId) {
    const [dono] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.contaId, existente.contaId)).limit(1);
    if (dono) throw new ErroShein(409, "conta_ja_conectada", "Esta loja da Shein já está ligada a outra conta do Plist.");
    await db.update(conexoesCanal).set({ contaId }).where(eq(conexoesCanal.id, existente.id));
    await db.update(tarefas).set({ contaId }).where(eq(tarefas.conexaoId, existente.id));
  }

  const campos = {
    accessTokenCifrado: cifrar(chaves.secretKey),
    refreshTokenCifrado: null,
    tokenExpiraEm: null, // as chaves da Shein não vencem
    situacao: "ativa" as const,
    apelido: loja.nome,
  };
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
    .values({ contaId, canal: "shein", usuarioExterno, ...campos })
    .returning({ id: conexoesCanal.id });
  return nova.id;
}

async function marcarRevogadaShein(conexao: { id: string; contaId: string; apelido: string | null }) {
  const db = obterDb();
  await db.update(conexoesCanal).set({ situacao: "revogada" }).where(eq(conexoesCanal.id, conexao.id));
  const [aberta] = await db
    .select({ id: tarefas.id })
    .from(tarefas)
    .where(and(eq(tarefas.conexaoId, conexao.id), eq(tarefas.tipo, "reconectar_canal"), eq(tarefas.situacao, "aberta")));
  if (!aberta) {
    await db.insert(tarefas).values({
      contaId: conexao.contaId,
      conexaoId: conexao.id,
      tipo: "reconectar_canal",
      titulo: "Reconectar a Shein",
      detalhe: `A Shein recusou as chaves${conexao.apelido ? ` de ${conexao.apelido}` : ""}. Conecte de novo em Canais.`,
    });
  }
}

// Chaves da conexão, para usar nas chamadas. Se a Shein recusar as chaves numa chamada, use comChaves.
export async function chavesValidas(conexaoId: string): Promise<ChavesShein> {
  const [c] = await obterDb().select().from(conexoesCanal).where(eq(conexoesCanal.id, conexaoId));
  if (!c || c.canal !== "shein") throw new Error("conexão da Shein não encontrada");
  if (c.situacao !== "ativa" || !c.accessTokenCifrado) {
    throw new ErroShein(401, "reconectar", "Conexão sem autorização: conecte a Shein de novo.");
  }
  return { openKeyId: c.usuarioExterno, secretKey: decifrar(c.accessTokenCifrado) };
}

// Roda `f` com as chaves da conexão; chave recusada vira conexão "revogada" + tarefa "Reconectar a Shein".
export async function comChaves<T>(conexaoId: string, f: (chaves: ChavesShein) => Promise<T>): Promise<T> {
  const chaves = await chavesValidas(conexaoId);
  try {
    return await f(chaves);
  } catch (e) {
    if (e instanceof ErroShein && e.codigo === "reconectar") {
      const [c] = await obterDb()
        .select({ id: conexoesCanal.id, contaId: conexoesCanal.contaId, apelido: conexoesCanal.apelido })
        .from(conexoesCanal)
        .where(eq(conexoesCanal.id, conexaoId));
      if (c) await marcarRevogadaShein(c);
    }
    throw e;
  }
}

// Horário que a Shein usa nas consultas: "yyyy-MM-dd HH:mm:ss" em UTC+8 (Pequim).
export function horaShein(d: Date): string {
  return new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");
}

// Texto de uma lista por idioma ([{ language, title }]), preferindo português.
export function textoNoIdioma(lista: unknown, campo: string): string {
  if (!Array.isArray(lista)) return typeof lista === "string" ? lista : "";
  const itens = lista.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  const de = (idioma: string) => itens.find((x) => String(x.language ?? "").toLowerCase() === idioma)?.[campo];
  const v = de("pt-br") ?? de("pt") ?? de("en") ?? itens.find((x) => x[campo])?.[campo];
  return typeof v === "string" ? v : "";
}

// Valor em reais (número ou texto) para centavos.
export function centavosShein(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
