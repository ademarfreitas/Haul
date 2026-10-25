// Limite e custo da IA nos anúncios (25/10/2026): o modelo mais barato e um teto de R$ 2 a cada 50 anúncios
// (R$ 0,04 por anúncio, decidido pelo usuário). Contas puras, sem banco: o banco fica em lib/ia.ts.
import type { IdPlano } from "@/lib/planos";

export const MODELO_IA = "claude-haiku-5-5";
// US$ por milhão de tokens do Claude Haiku 5.5 (pedido até 100 mil tokens, o caso daqui)
export const PRECO_DOLAR = { entrada: 0.1, saida: 0.5 };
// câmbio usado na conta de custo; folgado para o teto não estourar se o dólar subir
export const DOLAR_EM_REAIS = 6;

// anúncios com IA por mês, igual a lib/planos.ts; no teste grátis tudo fica liberado (como o CRM)
export const IA_POR_MES: Record<IdPlano, number> = { essencial: 5, profissional: 15, avancado: 50 };
export const IA_NO_TESTE = 50;

export const TETO_POR_ANUNCIO_MICRO = 40_000; // R$ 0,04, em milionésimos de real

// O que cada chamada pode gastar, no máximo: poucas fotos, pequenas, e resposta curta.
export const FOTOS_PARA_IA = 4;
export const LADO_FOTO_IA = 768; // px; cada foto vira uns 800 tokens
export const MAX_TOKENS_SAIDA = 1500;

export const TITULO_CURTO = 60; // Mercado Livre
export const TITULO_LONGO = 120; // Shopee
export const DESCRICAO_MAXIMA = 4000;

export type Uso = { input_tokens: number; output_tokens: number };

// custo de uma chamada, em milionésimos de real
export function custoMicroReais(u: Uso): number {
  const dolares = (u.input_tokens * PRECO_DOLAR.entrada + u.output_tokens * PRECO_DOLAR.saida) / 1_000_000;
  return Math.ceil(dolares * DOLAR_EM_REAIS * 1_000_000);
}

// pior caso de uma chamada, para conferir que o teto por anúncio cabe por construção
export function custoMaximoMicroReais(): number {
  const entrada = FOTOS_PARA_IA * Math.ceil((LADO_FOTO_IA * LADO_FOTO_IA) / 750) + 3000; // fotos + texto
  return custoMicroReais({ input_tokens: entrada, output_tokens: MAX_TOKENS_SAIDA });
}

type Conta = { plano: IdPlano | null; emTeste: boolean };

export function limiteDoMes(c: Conta): number {
  if (c.emTeste) return IA_NO_TESTE;
  return c.plano ? IA_POR_MES[c.plano] : 0;
}

// Pode usar se ainda há anúncios no mês e o gasto do mês não passou do teto (limite × R$ 0,04).
export function situacaoIa(c: Conta, usados: number, gastoMicro: number) {
  const limite = limiteDoMes(c);
  const teto = limite * TETO_POR_ANUNCIO_MICRO;
  const restam = Math.max(0, limite - usados);
  if (!limite) return { pode: false, restam, limite, motivo: "Escolha um plano em Minha conta para usar a IA." };
  if (restam === 0) return { pode: false, restam, limite, motivo: `Você usou os ${limite} anúncios com IA deste mês. Renova no dia 1º.` };
  if (gastoMicro >= teto) return { pode: false, restam: 0, limite, motivo: "A IA deste mês chegou ao limite de custo. Renova no dia 1º." };
  return { pode: true, restam, limite, motivo: "" };
}

// primeiro dia do mês, no horário de Brasília
export function inicioDoMes(agora = new Date()): Date {
  const [a, m] = agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).split("-");
  return new Date(`${a}-${m}-01T00:00:00-03:00`);
}

// corta no último espaço antes do limite, sem deixar vírgula ou traço no fim
export function cortar(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max + 1);
  const espaco = corte.lastIndexOf(" ");
  return (espaco > max * 0.6 ? corte.slice(0, espaco) : t.slice(0, max)).replace(/[\s,;:\-–]+$/, "");
}

export const CONDICOES_IA = ["nova_com_etiqueta", "nova_sem_etiqueta", "seminova", "usada_bom_estado", "usada_com_detalhes"] as const;

export type SugestaoIa = {
  tituloCurto: string;
  titulo: string;
  descricao: string;
  marca: string;
  cor: string;
  tamanho: string;
  condicao: (typeof CONDICOES_IA)[number] | "";
  faltou: string[];
};

// Confere o que a IA devolveu: só texto, nos tamanhos de cada canal, estado só dos valores conhecidos.
export function limparSugestao(bruto: unknown): SugestaoIa | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const txt = (k: string, max: number) => (typeof b[k] === "string" ? cortar(b[k] as string, max) : "");
  const titulo = txt("titulo", TITULO_LONGO);
  const tituloCurto = txt("tituloCurto", TITULO_CURTO) || cortar(titulo, TITULO_CURTO);
  if (!tituloCurto) return null;
  const condicao = (CONDICOES_IA as readonly string[]).includes(String(b.condicao)) ? (b.condicao as SugestaoIa["condicao"]) : "";
  const descricao = typeof b.descricao === "string" ? b.descricao.trim().slice(0, DESCRICAO_MAXIMA) : "";
  const faltou = Array.isArray(b.faltou) ? b.faltou.filter((x): x is string => typeof x === "string").map((x) => cortar(x, 120)).slice(0, 6) : [];
  return { tituloCurto, titulo: titulo || tituloCurto, descricao, marca: txt("marca", 80), cor: txt("cor", 60), tamanho: txt("tamanho", 30), condicao, faltou };
}
