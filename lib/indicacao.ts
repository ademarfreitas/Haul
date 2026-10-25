// Desconto de indicação: quantos meses com 5% cada conta ainda tem. A conta (saldoDeMeses e descontoIndicacao,
// em lib/planos.ts) é pura; aqui só se lê o banco.
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { cobrancas, indicacoes } from "@/db/schema";
import { saldoDeMeses, type Ciclo } from "@/lib/planos";

export type SaldoIndicacao = { saldo: number; indicada: boolean; premios: number };

// créditos: ter entrado pelo link de alguém (na data do cadastro) e cada indicada que já pagou (na data do prêmio)
export async function saldosDeIndicacao(contaIds: string[]): Promise<Map<string, SaldoIndicacao>> {
  const fora = new Map<string, SaldoIndicacao>();
  if (!contaIds.length) return fora;
  const db = obterDb();
  const [inds, pagas] = await Promise.all([
    db
      .select()
      .from(indicacoes)
      .where(or(inArray(indicacoes.indicadaId, contaIds), and(inArray(indicacoes.indicadoraId, contaIds), isNotNull(indicacoes.recompensaConcedidaEm)))),
    db
      .select({ contaId: cobrancas.contaId, pagaEm: cobrancas.pagaEm, ciclo: cobrancas.ciclo })
      .from(cobrancas)
      .where(and(inArray(cobrancas.contaId, contaIds), eq(cobrancas.situacao, "paga"))),
  ]);
  for (const id of contaIds) {
    const entrou = inds.filter((i) => i.indicadaId === id).map((i) => i.criadoEm);
    const premios = inds.filter((i) => i.indicadoraId === id && i.recompensaConcedidaEm).map((i) => i.recompensaConcedidaEm as Date);
    if (!entrou.length && !premios.length) continue;
    const pagamentos = pagas.filter((p) => p.contaId === id && p.pagaEm).map((p) => ({ pagaEm: p.pagaEm as Date, ciclo: p.ciclo as Ciclo }));
    fora.set(id, { saldo: saldoDeMeses([...entrou, ...premios], pagamentos), indicada: entrou.length > 0, premios: premios.length });
  }
  return fora;
}

export async function saldoDeIndicacao(contaId: string): Promise<SaldoIndicacao | null> {
  return (await saldosDeIndicacao([contaId])).get(contaId) ?? null;
}
