// Cookies assinados (HMAC-SHA256 com SEGREDO_SESSAO) e a sessão de quem entrou (conta + usuário).
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const COOKIE_CONTA = "plist_conta";

function segredo(): string {
  const s = process.env.SEGREDO_SESSAO;
  if (!s) throw new Error("SEGREDO_SESSAO não definido (ver .env.example)");
  return s;
}

function assinatura(dados: string): string {
  return createHmac("sha256", segredo()).update(dados).digest("base64url");
}

// valor + validade, assinados; devolve o texto para gravar no cookie
export function assinar(valor: unknown, segundos: number): string {
  const dados = Buffer.from(JSON.stringify({ v: valor, exp: Date.now() + segundos * 1000 })).toString("base64url");
  return `${dados}.${assinatura(dados)}`;
}

export function conferirAssinado<T>(texto: string | undefined): T | null {
  if (!texto) return null;
  const [dados, sig] = texto.split(".");
  if (!dados || !sig) return null;
  const esperado = Buffer.from(assinatura(dados));
  const recebido = Buffer.from(sig);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;
  const { v, exp } = JSON.parse(Buffer.from(dados, "base64url").toString("utf8")) as { v: T; exp: number };
  return Date.now() < exp ? v : null;
}

// https em produção ou atrás de túnel; em http://localhost o navegador não guarda cookie "secure"
export function cookieSeguro(): boolean {
  return (process.env.APP_URL ?? "").startsWith("https://");
}

export type Sessao = { c: string; u: string }; // conta e usuário

export async function lerSessao(): Promise<Sessao | null> {
  const jar = await cookies();
  const s = conferirAssinado<Sessao>(jar.get(COOKIE_CONTA)?.value);
  // cookie antigo (só o id da conta, do login provisório) não vale mais
  return s && typeof s === "object" && s.c && s.u ? s : null;
}

export async function contaDaSessao(): Promise<string | null> {
  return (await lerSessao())?.c ?? null;
}

const TRINTA_DIAS = 30 * 24 * 60 * 60;
const DOZE_HORAS = 12 * 60 * 60;

// "Manter conectado": cookie de 30 dias; sem isso, some ao fechar o navegador (e vale no máximo 12 h).
export async function abrirSessao(sessao: Sessao, manter: boolean): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_CONTA, assinar(sessao, manter ? TRINTA_DIAS : DOZE_HORAS), {
    httpOnly: true,
    secure: cookieSeguro(),
    sameSite: "lax",
    path: "/",
    ...(manter ? { maxAge: TRINTA_DIAS } : {}),
  });
}

export async function fecharSessao(): Promise<void> {
  (await cookies()).set(COOKIE_CONTA, "", { path: "/", maxAge: 0 });
}
