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
