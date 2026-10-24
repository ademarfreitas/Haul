// Planos do Plist (definidos pelo usuário em 24/10/2026): mudar só aqui. Os limites ainda não são cobrados pelo sistema.
export const PLANOS = [
  {
    id: "essencial",
    nome: "Essencial",
    precoCentavos: 1990,
    itens: ["Até 2 canais conectados", "Até 50 anúncios", "1 usuário", "IA nos anúncios: 5 por mês", "SMS a cada venda", "Etiquetas em PDF e ZPL"],
  },
  {
    id: "profissional",
    nome: "Profissional",
    precoCentavos: 4990,
    selo: "Mais escolhido",
    itens: ["Todos os canais", "Até 100 anúncios", "Até 3 usuários", "IA nos anúncios: 15 por mês", "SMS a cada venda", "Impressão direta pelo Plist Agente"],
  },
  {
    id: "avancado",
    nome: "Avançado",
    precoCentavos: 7990,
    itens: ["Tudo do Profissional", "Até 500 anúncios", "Até 5 usuários", "IA nos anúncios: 50 por mês", "Command Center com comparação de preços", "Módulo CRM: clientes, funil e campanhas"],
  },
] as const;

export type IdPlano = (typeof PLANOS)[number]["id"];

// sem pagamento depois do teste, a conta fica só leitura depois destes dias
export const DIAS_DE_TOLERANCIA = 5;
