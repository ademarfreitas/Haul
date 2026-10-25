// Planos do Plist (definidos pelo usuário em 24/10/2026): mudar só aqui. Os limites ainda não são cobrados pelo sistema.
export const PLANOS = [
  {
    id: "essencial",
    nome: "Essencial",
    precoCentavos: 1990,
    precoAnualCentavos: 19900,
    itens: ["Até 2 canais conectados", "Até 50 anúncios", "1 usuário", "IA nos anúncios: 5 por mês", "SMS a cada venda", "Etiquetas em PDF e ZPL"],
  },
  {
    id: "profissional",
    nome: "Profissional",
    precoCentavos: 4990,
    precoAnualCentavos: 49900,
    selo: "Mais escolhido",
    itens: ["Todos os canais", "Até 100 anúncios", "Até 3 usuários", "IA nos anúncios: 15 por mês", "SMS a cada venda", "Impressão direta pelo Plist Agente"],
  },
  {
    id: "avancado",
    nome: "Avançado",
    precoCentavos: 7990,
    precoAnualCentavos: 79900,
    itens: ["Tudo do Profissional", "Até 500 anúncios", "Até 5 usuários", "IA nos anúncios: 50 por mês", "Command Center com comparação de preços", "Módulo CRM: clientes, funil e campanhas"],
  },
] as const;

export type IdPlano = (typeof PLANOS)[number]["id"];

// Plano anual (25/10/2026): paga 10 mensalidades e usa 12 (uns 17% de desconto), cobrado de uma vez.
export const CICLOS = ["mensal", "anual"] as const;
export type Ciclo = (typeof CICLOS)[number];

export function precoNoCiclo(p: (typeof PLANOS)[number], ciclo: Ciclo): number {
  return ciclo === "anual" ? p.precoAnualCentavos : p.precoCentavos;
}

// quanto o anual economiza em relação a 12 mensalidades
export function economiaAnual(p: (typeof PLANOS)[number]): number {
  return p.precoCentavos * 12 - p.precoAnualCentavos;
}

// sem pagamento depois do teste, a conta fica só leitura depois destes dias
export const DIAS_DE_TOLERANCIA = 5;

// Indicação (25/10/2026): as duas pontas ganham 5% de desconto em 3 meses de plano. Quem entrou pelo link de outra
// conta, nos 3 primeiros meses; quem indicou, nos 3 meses seguintes a cada indicada que paga (além dos 30 dias).
// Os meses se somam (duas indicações = 6 meses com 5%), o percentual não. No anual, vale 5% sobre os meses da anuidade
// que caem no saldo (ex.: 3 meses = 5% sobre 3/12 do valor).
export const DESCONTO_INDICACAO = 0.05;
export const MESES_COM_DESCONTO = 3;

// meses que um pagamento cobre
export const mesesDoCiclo = (ciclo: Ciclo): number => (ciclo === "anual" ? 12 : 1);

// desconto, em centavos, do próximo pagamento de uma conta com `saldo` meses de desconto
export function descontoIndicacao(p: (typeof PLANOS)[number], ciclo: Ciclo, saldo: number): number {
  const usa = Math.min(Math.max(saldo, 0), mesesDoCiclo(ciclo));
  return Math.round((precoNoCiclo(p, ciclo) * DESCONTO_INDICACAO * usa) / mesesDoCiclo(ciclo));
}

// Saldo de meses com desconto, em ordem de data: cada crédito (entrou indicada, ou uma indicada pagou) põe 3 meses e
// cada pagamento gasta os meses que cobre. Crédito e pagamento na mesma hora: o crédito vem antes.
export function saldoDeMeses(creditos: Date[], pagamentos: { pagaEm: Date; ciclo: Ciclo }[]): number {
  const eventos = [
    ...creditos.map((d) => ({ t: d.getTime(), ordem: 0, meses: MESES_COM_DESCONTO })),
    ...pagamentos.map((p) => ({ t: p.pagaEm.getTime(), ordem: 1, meses: -mesesDoCiclo(p.ciclo) })),
  ].sort((a, b) => a.t - b.t || a.ordem - b.ordem);
  return eventos.reduce((saldo, e) => Math.max(saldo + e.meses, 0), 0);
}
