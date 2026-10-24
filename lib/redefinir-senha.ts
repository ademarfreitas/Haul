// Link de "esqueci a senha": token assinado (lib/sessao.ts) com o usuário e uma impressão do hash
// atual da senha. Vale 1 hora e só uma vez, porque ao trocar a senha a impressão deixa de bater.
import { createHash } from "node:crypto";
import { assinar, conferirAssinado } from "@/lib/sessao";

const UMA_HORA = 60 * 60;

type Dados = { u: string; h: string };

const impressao = (senhaHash: string | null) => createHash("sha256").update(senhaHash ?? "").digest("base64url").slice(0, 16);

export function gerarTokenSenha(usuarioId: string, senhaHash: string | null): string {
  return assinar({ u: usuarioId, h: impressao(senhaHash) } satisfies Dados, UMA_HORA);
}

// usuário do token, se a assinatura e a validade conferem (a senha atual se confere com valeParaSenha)
export function lerTokenSenha(token: string | undefined): Dados | null {
  const d = conferirAssinado<Dados>(token);
  return d && typeof d === "object" && typeof d.u === "string" && typeof d.h === "string" ? d : null;
}

export function valeParaSenha(d: Dados, senhaHashAtual: string | null): boolean {
  return impressao(senhaHashAtual) === d.h;
}
