// Planos do Plist (definidos pelo usuário em 24/10/2026): mudar só aqui. Os limites ainda não são cobrados pelo sistema.
export const PLANOS = [
  {
    id: "essencial",
    nome: "Essencial",
    precoCentavos: 1490,
    itens: ["Até 2 canais conectados", "Até 30 anúncios", "1 usuário", "Etiquetas em PDF e ZPL", "Avisos por e-mail"],
  },
  {
    id: "profissional",
    nome: "Profissional",
    precoCentavos: 3990,
    selo: "Mais escolhido",
    itens: ["Até 3 canais conectados", "Até 100 anúncios", "Até 3 usuários", "IA nos anúncios: 10 por mês", "Avisos por SMS", "Impressão direta pelo Plist Agente"],
  },
  {
    id: "avancado",
    nome: "Avançado",
    precoCentavos: 5990,
    itens: ["Tudo do Profissional", "Todos os canais", "Até 500 anúncios", "Até 5 usuários", "IA nos anúncios: 30 por mês", "Avisos por SMS e relatório por WhatsApp", "Command Center com comparação de preços"],
  },
] as const;

export type IdPlano = (typeof PLANOS)[number]["id"];

// sem pagamento depois do teste, a conta fica só leitura depois destes dias
export const DIAS_DE_TOLERANCIA = 5;
