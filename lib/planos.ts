// Planos do Plist. Preços e conteúdo ainda são exemplo (em aberto no CLAUDE.md): mudar só aqui.
export const PLANOS = [
  { id: "essencial", nome: "Essencial", precoCentavos: 4990, itens: ["Até 2 canais conectados", "Até 300 anúncios", "Etiquetas em PDF e ZPL", "Avisos por e-mail"] },
  {
    id: "profissional",
    nome: "Profissional",
    precoCentavos: 9990,
    selo: "Mais escolhido",
    itens: ["Os 7 canais", "Anúncios ilimitados", "Impressão direta pelo Plist Agente", "Avisos por WhatsApp e SMS", "IA nos anúncios: 200 por mês"],
  },
  {
    id: "avancado",
    nome: "Avançado",
    precoCentavos: 17990,
    itens: ["Tudo do Profissional", "Command Center com comparação de preços", "Perguntas ao mercado sem limite", "3 usuários com permissões", "Suporte por WhatsApp"],
  },
] as const;

export type IdPlano = (typeof PLANOS)[number]["id"];

// sem pagamento depois do teste, a conta fica só leitura depois destes dias
export const DIAS_DE_TOLERANCIA = 5;
