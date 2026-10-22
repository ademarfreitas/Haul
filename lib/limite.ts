// Freio de tentativas de login por e-mail, na memória do servidor. Na Vercel cada instância tem a
// sua memória, então isto só segura o grosso; um limite guardado no banco vem antes do beta aberto.
const JANELA_MS = 15 * 60 * 1000;
const MAXIMO = 8;
const falhas = new Map<string, { n: number; desde: number }>();

export function bloqueado(chave: string): boolean {
  const f = falhas.get(chave);
  if (!f) return false;
  if (Date.now() - f.desde > JANELA_MS) {
    falhas.delete(chave);
    return false;
  }
  return f.n >= MAXIMO;
}

export function registrarFalha(chave: string): void {
  const f = falhas.get(chave);
  if (!f || Date.now() - f.desde > JANELA_MS) falhas.set(chave, { n: 1, desde: Date.now() });
  else f.n++;
  if (falhas.size > 10_000) falhas.clear();
}

export function limparFalhas(chave: string): void {
  falhas.delete(chave);
}
