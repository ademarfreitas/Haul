// Quem está usando o sistema: lê a sessão, busca conta e usuário e manda para o lugar certo
// (entrar, primeiros passos) quando falta algo. Usar no começo das páginas do sistema.
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { obterDb } from "@/db/cliente";
import { contas, usuarios } from "@/db/schema";
import { lerSessao } from "@/lib/sessao";

export async function contaAtual() {
  const sessao = await lerSessao();
  if (!sessao) return null;
  const [linha] = await obterDb()
    .select({ conta: contas, usuario: { id: usuarios.id, nome: usuarios.nome, email: usuarios.email } })
    .from(usuarios)
    .innerJoin(contas, eq(contas.id, usuarios.contaId))
    .where(and(eq(usuarios.id, sessao.u), eq(usuarios.contaId, sessao.c)))
    .limit(1);
  return linha ?? null;
}

// Sem sessão vai para /entrar (e volta para `aqui` depois); sem primeiros passos, vai para eles.
export async function exigirConta(aqui: string) {
  const atual = await contaAtual();
  if (!atual) redirect(`/entrar?volta=${encodeURIComponent(aqui)}`);
  if (!atual.conta.primeirosPassosEm) redirect("/primeiros-passos");
  return atual;
}

// Só caminhos internos: evita mandar a pessoa para outro site depois do login.
export function destinoSeguro(volta: unknown, padrao = "/inventario"): string {
  return typeof volta === "string" && /^\/(?![/\\])/.test(volta) ? volta : padrao;
}

export function diasDeTeste(testeAte: Date): number {
  return Math.max(0, Math.ceil((testeAte.getTime() - Date.now()) / 86_400_000));
}
