// Senhas com scrypt (node:crypto, sem dependência nativa). Formato guardado em usuarios.senha_hash:
// scrypt$<log2 N>$<r>$<p>$<sal>$<hash>, sal e hash em base64url. Os parâmetros vão junto para dar
// para subir o custo depois sem invalidar as senhas antigas.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const LOG_N = 15;
const R = 8;
const P = 1;
const TAMANHO = 32;
export const SENHA_MINIMA = 10;

function derivar(senha: string, sal: Buffer, logN: number, r: number, p: number): Promise<Buffer> {
  const N = 2 ** logN;
  const opcoes: ScryptOptions = { N, r, p, maxmem: 256 * N * r };
  return new Promise((ok, falha) => scrypt(senha.normalize("NFKC"), sal, TAMANHO, opcoes, (e, k) => (e ? falha(e) : ok(k))));
}

export async function gerarHash(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(senha, sal, LOG_N, R, P);
  return ["scrypt", LOG_N, R, P, sal.toString("base64url"), hash.toString("base64url")].join("$");
}

// Sem hash (e-mail que não existe) ainda calcula um, para a resposta levar o mesmo tempo.
export async function conferirSenha(senha: string, guardado: string | null | undefined): Promise<boolean> {
  const partes = (guardado ?? "").split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") {
    await derivar(senha, randomBytes(16), LOG_N, R, P);
    return false;
  }
  const [, logN, r, p, sal, hash] = partes;
  const esperado = Buffer.from(hash, "base64url");
  const calculado = await derivar(senha, Buffer.from(sal, "base64url"), Number(logN), Number(r), Number(p));
  return esperado.length === calculado.length && timingSafeEqual(esperado, calculado);
}
