// Cifra dos tokens dos marketplaces (AES-256-GCM com CHAVE_TOKENS). O banco só vê o texto cifrado.
// Formato: v1.<iv>.<tag>.<dados>, tudo em base64url. O "v1" deixa trocar a chave no futuro.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function chave(): Buffer {
  const b64 = process.env.CHAVE_TOKENS;
  if (!b64) throw new Error("CHAVE_TOKENS não definida (ver .env.example)");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("CHAVE_TOKENS precisa ter 32 bytes em base64");
  return k;
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv, c.getAuthTag(), dados].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decifrar(cifrado: string): string {
  const [versao, iv, tag, dados] = cifrado.split(".");
  if (versao !== "v1" || !iv || !tag || dados === undefined) throw new Error("token cifrado em formato desconhecido");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64url")), d.final()]).toString("utf8");
}
