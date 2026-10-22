// Cookies assinados (HMAC-SHA256 com SEGREDO_SESSAO) e a conta da sessão.
// Ainda não há cadastro/login: até lá, a sessão aponta para uma "conta de desenvolvimento"
// criada por /api/dev/entrar?codigo=..., que só funciona com CODIGO_CONTA_DEV definido.
// Esse código é uma senha provisória: o app pode estar num endereço público (callback do ML).
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const COOKIE_CONTA = "haul_conta";

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

export async function contaDaSessao(): Promise<string | null> {
  const jar = await cookies();
  return conferirAssinado<string>(jar.get(COOKIE_CONTA)?.value);
}

export function codigoDevConfere(codigo: string | null): boolean {
  const certo = process.env.CODIGO_CONTA_DEV;
  if (!certo || certo.length < 12 || !codigo) return false;
  const a = Buffer.from(assinatura(certo));
  const b = Buffer.from(assinatura(codigo));
  return timingSafeEqual(a, b);
}
