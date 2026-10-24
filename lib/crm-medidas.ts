// As medidas do CRM, calculadas dos pedidos na hora (nada é digitado). Funções puras.
//
// RITMO: intervalo médio entre os dias de compra do cliente. Quem comprou uma vez só usa o ritmo típico
// da loja (a mediana de quem voltou; 30 dias enquanto pouca gente voltou).
// SEGMENTO (um por cliente, nesta ordem): perdido (> 3× o ritmo e > 60 dias sem comprar), sumindo
// (> 1,5× e > 21 dias), novo (1ª compra nos últimos 30 dias), fiel (3+ compras, dentro do ritmo), ativo, nunca.

const DIA = 86_400_000;
const t = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
export const diasEntre = (a: string, b: string) => Math.round((t(b) - t(a)) / DIA);
export const somaDias = (iso: string, n: number) => new Date(t(iso) + n * DIA).toISOString().slice(0, 10);

// a data do dia em São Paulo, como AAAA-MM-DD
export const diaSP = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

export const SEGMENTOS = {
  sumindo: { rotulo: "Sumindo", um: "Sumindo", pilula: "p-warn", acao: "Passou do ritmo normal: vale um \"sentimos sua falta\"." },
  perdido: { rotulo: "Perdidos", um: "Perdido", pilula: "p-bad", acao: "Faz tempo que não compra: reative com uma novidade ou condição especial." },
  novo: { rotulo: "Novos", um: "Novo", pilula: "p-accent", acao: "Pós-venda: pergunte se gostou e mostre o que chegou." },
  fiel: { rotulo: "Fiéis", um: "Fiel", pilula: "p-good", acao: "Agradeça e avise primeiro quando chegar peça do estilo dele." },
  ativo: { rotulo: "Ativos", um: "Ativo", pilula: "p-muted", acao: "Mantenha o contato com novidades." },
  nunca: { rotulo: "Sem compras", um: "Sem compras", pilula: "p-muted", acao: "Cadastrado e sem compra: convide para conhecer." },
} as const;
export type Segmento = keyof typeof SEGMENTOS;
export const ORDEM_SEGMENTOS: Segmento[] = ["sumindo", "perdido", "novo", "fiel", "ativo", "nunca"];

export const ORIGENS = {
  marketplace: "Marketplace",
  indicacao: "Indicação",
  instagram: "Instagram",
  facebook: "Facebook",
  google: "Google",
  whatsapp: "WhatsApp",
  loja_fisica: "Loja física / bazar",
  site: "Site",
  evento: "Evento / feira",
  outro: "Outro",
} as const;

export function ritmoDe(m: { primeira: string | null; ultima: string | null; dias: number }): number | null {
  if (!m.primeira || !m.ultima || m.dias < 2) return null;
  const r = diasEntre(m.primeira, m.ultima) / (m.dias - 1);
  return r > 0 ? Math.max(1, Math.round(r)) : null;
}

export function ritmoDaLoja(ritmos: number[]): number {
  const v = ritmos.filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length < 3) return 30;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

export function classifica(m: { compras: number; primeira: string | null; ultima: string | null; ritmo: number | null }, hoje: string, ritmoLoja = 30): Segmento {
  if (!m.compras || !m.ultima || !m.primeira) return "nunca";
  const parado = diasEntre(m.ultima, hoje);
  const ritmo = m.ritmo ?? ritmoLoja;
  if (parado > Math.max(3 * ritmo, 60)) return "perdido";
  if (parado > Math.max(1.5 * ritmo, 21)) return "sumindo";
  if (m.compras === 1 && diasEntre(m.primeira, hoje) <= 30) return "novo";
  if (m.compras >= 3 && parado <= ritmo * 1.2) return "fiel";
  return "ativo";
}

// Quantos dias faltam para o aniversário (0 = hoje); 29/02 vira 28/02 no ano comum.
export function diasParaAniversario(aniversario: string | null, hoje: string): number | null {
  if (!aniversario) return null;
  const [, mm, dd] = aniversario.slice(0, 10).split("-").map(Number);
  const data = (a: number) => {
    const bissexto = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
    const d = mm === 2 && dd === 29 && !bissexto ? 28 : dd;
    return `${a}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  const ano = Number(hoje.slice(0, 4));
  const n = diasEntre(hoje, data(ano));
  return n >= 0 ? n : diasEntre(hoje, data(ano + 1));
}

export type LinhaCliente = {
  compras: number;
  totalCentavos: number;
  primeira: string | null; // AAAA-MM-DD
  ultima: string | null;
  dias: number; // dias distintos com compra
  aniversario: string | null;
};

export type Medidas = {
  ritmo: number | null;
  segmento: Segmento;
  parado: number | null;
  proxima: string | null;
  atraso: number;
  ticketCentavos: number;
  maior: boolean; // entre os 20% que mais compraram
  aniversarioEm: number | null;
};

export function mede<T extends LinhaCliente>(linhas: T[], hoje: string): { clientes: (T & Medidas)[]; ritmoLoja: number } {
  const ritmos = linhas.map((l) => ritmoDe(l));
  const loja = ritmoDaLoja(ritmos.filter((r): r is number => r != null));
  const totais = linhas.filter((l) => l.totalCentavos > 0).map((l) => l.totalCentavos).sort((a, b) => b - a);
  const corte = totais.length ? totais[Math.max(0, Math.ceil(totais.length * 0.2) - 1)] : Infinity;
  const clientes = linhas.map((l, i) => {
    const ritmo = ritmos[i];
    const r = ritmo ?? (l.compras ? loja : null);
    const proxima = l.ultima && r ? somaDias(l.ultima, r) : null;
    return {
      ...l,
      ritmo,
      segmento: classifica({ ...l, ritmo }, hoje, loja),
      parado: l.ultima ? diasEntre(l.ultima, hoje) : null,
      proxima,
      atraso: proxima ? Math.max(0, diasEntre(proxima, hoje)) : 0,
      ticketCentavos: l.compras ? Math.round(l.totalCentavos / l.compras) : 0,
      maior: l.totalCentavos > 0 && l.totalCentavos >= corte,
      aniversarioEm: diasParaAniversario(l.aniversario, hoje),
    };
  });
  return { clientes, ritmoLoja: loja };
}

// LGPD: etiqueta não pode guardar dado sensível (art. 5º, II).
const SENSIVEIS = /(sa[uú]de|doen[cç]a|religi|igreja|evang[eé]l|cat[oó]lic|pol[ií]tic|partido|orienta[cç][aã]o|\bgay\b|l[eé]sbica|transg[eê]ner|transexual|\bra[cç]a\b|[eé]tnia|biometr|gen[eé]tic|sindica|defici[eê]ncia|gr[aá]vida|gestante)/i;

export function etiquetaValida(texto: string): { ok: string } | { erro: string } {
  const e = texto.trim().replace(/\s+/g, " ").toLowerCase();
  if (!e) return { erro: "Escreva a etiqueta." };
  if (e.length > 30) return { erro: "Etiqueta com até 30 letras." };
  if (SENSIVEIS.test(e)) return { erro: "Essa etiqueta guarda dado sensível (saúde, religião, política, orientação, raça...). A LGPD não deixa." };
  return { ok: e };
}
