"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { cobrancas, contas, indicacoes } from "@/db/schema";
import { ehAdmin } from "@/lib/admin";
import { periodoDoPagamento } from "@/lib/assinantes";
import { reais } from "@/lib/canais";
import { contaAtual } from "@/lib/conta";
import { saldoDeIndicacao } from "@/lib/indicacao";
import { CICLOS, descontoIndicacao, PLANOS, precoNoCiclo } from "@/lib/planos";

const FORMAS = ["pix", "boleto", "cartao", "manual"] as const;
const DIAS_DE_PREMIO = 30;
const texto = (f: FormData, nome: string, max = 200) => String(f.get(nome) ?? "").trim().slice(0, max);

// Lançamento à mão de uma mensalidade (ou anuidade) recebida (Pix direto, por exemplo) enquanto o provedor de cobrança não
// está ligado. Grava a cobrança paga, empurra o "pago até" da conta e, se for a primeira, dá o prêmio da indicação.
export async function registrarPagamento(f: FormData): Promise<void> {
  const atual = await contaAtual();
  if (!atual || !ehAdmin(atual.usuario.email)) return;
  const plano = PLANOS.find((p) => p.id === texto(f, "plano", 20));
  const forma = FORMAS.find((x) => x === texto(f, "forma", 10));
  const ciclo = CICLOS.find((x) => x === texto(f, "ciclo", 10)) ?? "mensal";
  if (!plano || !forma) return;
  const db = obterDb();
  const [conta] = await db.select().from(contas).where(eq(contas.id, texto(f, "conta", 40))).limit(1);
  if (!conta) return;

  const agora = new Date();
  const { inicio, fim } = periodoDoPagamento(conta, agora, ciclo);
  const primeira = !conta.pagoAte;
  // indicação (indicada ou quem indicou): 5% nos meses que ainda tem de saldo; o valor gravado já sai com o desconto
  const desconto = descontoIndicacao(plano, ciclo, (await saldoDeIndicacao(conta.id))?.saldo ?? 0);
  const obs = texto(f, "obs", 300) || `lançado à mão por ${atual.usuario.email}`;
  await db.insert(cobrancas).values({
    contaId: conta.id,
    plano: plano.id,
    ciclo,
    valorCentavos: precoNoCiclo(plano, ciclo) - desconto,
    periodoInicio: inicio,
    periodoFim: fim,
    vencimento: inicio,
    situacao: "paga",
    forma,
    pagaEm: agora,
    taxaProvedorCentavos: forma === "manual" ? 0 : null,
    observacao: desconto ? `${obs} · desconto de indicação: ${reais(desconto)}` : obs,
  });
  await db.update(contas).set({ plano: plano.id, ciclo, pagoAte: fim, situacaoAssinatura: "ativa" }).where(eq(contas.id, conta.id));

  // Indicação: quem indicou ganha 30 dias quando a indicada paga a primeira mensalidade (uma vez só). A data do prêmio
  // também dá a quem indicou 3 meses com 5% de desconto (lib/indicacao.ts).
  if (primeira) {
    const [ind] = await db
      .select({ id: indicacoes.id, indicadora: contas })
      .from(indicacoes)
      .innerJoin(contas, eq(contas.id, indicacoes.indicadoraId))
      .where(and(eq(indicacoes.indicadaId, conta.id), isNull(indicacoes.recompensaConcedidaEm)))
      .limit(1);
    if (ind) {
      const somar = (d: Date) => new Date(Math.max(d.getTime(), agora.getTime()) + DIAS_DE_PREMIO * 86_400_000);
      await db
        .update(contas)
        .set(ind.indicadora.pagoAte ? { pagoAte: somar(ind.indicadora.pagoAte) } : { testeAte: somar(ind.indicadora.testeAte) })
        .where(eq(contas.id, ind.indicadora.id));
      await db.update(indicacoes).set({ recompensaConcedidaEm: agora }).where(eq(indicacoes.id, ind.id));
    }
  }
  revalidatePath("/admin");
}
