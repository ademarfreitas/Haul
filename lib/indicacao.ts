// Desconto de quem entrou por indicação: a conta é indicada e quantos meses de plano ela já pagou.
// A conta (lib/planos.ts descontoIndicacao) é pura; aqui só se lê o banco.
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { cobrancas, indicacoes } from "@/db/schema";
import { mesesDoCiclo } from "@/lib/planos";

// null quando a conta não veio por indicação; senão, os meses já pagos (mensalidade = 1, anuidade = 12)
export async function mesesPagosDaIndicada(contaId: string): Promise<number | null> {
  const db = obterDb();
  const [ind] = await db.select({ id: indicacoes.id }).from(indicacoes).where(eq(indicacoes.indicadaId, contaId)).limit(1);
  if (!ind) return null;
  const pagas = await db
    .select({ ciclo: cobrancas.ciclo })
    .from(cobrancas)
    .where(and(eq(cobrancas.contaId, contaId), eq(cobrancas.situacao, "paga")));
  return pagas.reduce((s, c) => s + mesesDoCiclo(c.ciclo), 0);
}
