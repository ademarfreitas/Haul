// Contas pagantes do Plist vistas pelo dono (/admin): em que pé está cada assinatura, quanto entra e quanto custa.
// Funções puras (sem banco), testadas em testes/assinantes.test.mjs. Desenho em docs/cobranca.md.
import { DIAS_DE_TOLERANCIA, PLANOS, type Ciclo, type IdPlano } from "@/lib/planos";

const DIA = 86_400_000;

export type Situacao =
  | "teste" // dentro dos 30 dias grátis
  | "aguardando" // teste acabou há até 5 dias e ainda não pagou a primeira
  | "nao_converteu" // teste acabou há mais de 5 dias sem pagamento: conta só leitura
  | "em_dia" // pago até uma data futura
  | "inadimplente" // mensalidade venceu há até 5 dias e não foi paga
  | "vencida" // venceu há mais de 5 dias e não renovou: conta só leitura
  | "cancelada";

export const SITUACOES: Record<Situacao, { nome: string; tom: "accent" | "good" | "warn" | "bad" | "muted" }> = {
  teste: { nome: "Teste grátis", tom: "accent" },
  aguardando: { nome: "Teste acabou, sem pagamento", tom: "warn" },
  nao_converteu: { nome: "Não assinou", tom: "muted" },
  em_dia: { nome: "Em dia", tom: "good" },
  inadimplente: { nome: "Inadimplente", tom: "bad" },
  vencida: { nome: "Venceu e não renovou", tom: "bad" },
  cancelada: { nome: "Cancelada", tom: "muted" },
};

type ContaAssinatura = { situacaoAssinatura: string; testeAte: Date; pagoAte: Date | null };

// A data que manda: fim do teste para quem nunca pagou, fim do período pago para quem já pagou.
export function vencimento(c: ContaAssinatura): Date {
  return c.pagoAte ?? c.testeAte;
}

// Calculada a partir das datas (não do campo situacao_assinatura, que nenhuma rotina atualiza ainda).
export function situacaoDe(c: ContaAssinatura, agora = new Date()): Situacao {
  if (c.situacaoAssinatura === "cancelada") return "cancelada";
  const vence = vencimento(c);
  if (vence.getTime() >= agora.getTime()) return c.pagoAte ? "em_dia" : "teste";
  const atraso = (agora.getTime() - vence.getTime()) / DIA;
  if (c.pagoAte) return atraso <= DIAS_DE_TOLERANCIA ? "inadimplente" : "vencida";
  return atraso <= DIAS_DE_TOLERANCIA ? "aguardando" : "nao_converteu";
}

// dias até vencer (negativo = dias de atraso)
export function diasAteVencer(c: ContaAssinatura, agora = new Date()): number {
  return Math.ceil((vencimento(c).getTime() - agora.getTime()) / DIA);
}

// valor por mês: no anual, o preço do ano dividido por 12 (é o que conta na receita recorrente)
export function precoDoPlano(plano: IdPlano | null | undefined, ciclo: Ciclo = "mensal"): number {
  const p = PLANOS.find((x) => x.id === plano);
  if (!p) return 0;
  return ciclo === "anual" ? Math.round(p.precoAnualCentavos / 12) : p.precoCentavos;
}

function somarMeses(d: Date, meses: number): Date {
  const r = new Date(d);
  const dia = r.getUTCDate();
  r.setUTCMonth(r.getUTCMonth() + meses);
  if (r.getUTCDate() !== dia) r.setUTCDate(0); // 31/01 → 28/02 (ou 29), não 03/03
  return r;
}

// Período que um pagamento cobre. Quem paga em dia, durante o teste ou dentro da tolerância continua de onde
// parou (fim do teste ou do último período), para não perder dias nem ganhar de graça; quem voltou depois de
// ficar só leitura começa hoje.
// O anual cobre 12 meses.
export function periodoDoPagamento(c: ContaAssinatura, agora = new Date(), ciclo: Ciclo = "mensal"): { inicio: Date; fim: Date } {
  const base = vencimento(c);
  const atraso = (agora.getTime() - base.getTime()) / DIA;
  const inicio = atraso <= DIAS_DE_TOLERANCIA ? base : agora;
  return { inicio, fim: somarMeses(inicio, ciclo === "anual" ? 12 : 1) };
}

// ---------- custos (estimativas de plist/docs/custo-e-planos.md, 24/10/2026; conferir com as faturas) ----------

export const CUSTO_FIXO_MENSAL = [
  { nome: "Vercel Pro (site e app)", centavos: 11_000 },
  { nome: "Neon (banco)", centavos: 11_000 },
  { nome: "Resend (e-mails, acima de 3 mil/mês)", centavos: 11_000 },
] as const;
export const IMPOSTO = 0.06; // Simples Nacional, software, no começo
export const TAXA_COBRANCA_PADRAO = 199; // Pix/boleto, quando o provedor não informou a taxa
// banco + funções + e-mail por conta e por mês, no uso típico de cada plano (o teste conta como Essencial)
export const INFRA_POR_CONTA: Record<IdPlano, number> = { essencial: 60, profissional: 120, avancado: 250 };

type Paga = { valorCentavos: number; taxaProvedorCentavos: number | null };
type ContaAtiva = { plano: IdPlano | null; ciclo?: Ciclo; situacao: Situacao };

export type Custos = { linhas: { nome: string; centavos: number }[]; total: number };

// Custo do mês: fixo + imposto e taxa de cobrança sobre o que entrou + infraestrutura de cada conta que usa o sistema.
// IA e SMS ainda não estão ligados; entram aqui quando forem.
export function custosDoMes(pagas: Paga[], contasDoMes: ContaAtiva[]): Custos {
  const entrada = pagas.reduce((s, p) => s + p.valorCentavos, 0);
  const usando = contasDoMes.filter((c) => c.situacao !== "cancelada" && c.situacao !== "nao_converteu" && c.situacao !== "vencida");
  const linhas = [
    ...CUSTO_FIXO_MENSAL.map((f) => ({ nome: f.nome, centavos: f.centavos })),
    { nome: `Imposto (${Math.round(IMPOSTO * 100)}% do que entrou)`, centavos: Math.round(entrada * IMPOSTO) },
    { nome: "Taxa do provedor de cobrança", centavos: pagas.reduce((s, p) => s + (p.taxaProvedorCentavos ?? TAXA_COBRANCA_PADRAO), 0) },
    { nome: `Infraestrutura por conta (${usando.length} usando)`, centavos: usando.reduce((s, c) => s + INFRA_POR_CONTA[c.plano ?? "essencial"], 0) },
  ];
  return { linhas, total: linhas.reduce((s, l) => s + l.centavos, 0) };
}

// Receita recorrente do mês (MRR): mensalidade de quem está em dia ou dentro da tolerância (o anual entra como 1/12).
export function receitaRecorrente(contas: ContaAtiva[]): number {
  return contas.filter((c) => c.situacao === "em_dia" || c.situacao === "inadimplente").reduce((s, c) => s + precoDoPlano(c.plano, c.ciclo), 0);
}
