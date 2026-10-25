// Ler o que vem do fornecedor: o XML da NF-e de compra e a planilha (CSV). Só funções puras: rodam no navegador
// (prévia antes de importar) e no servidor (conferência ao gravar). Gravar fica em lib/importar.ts.

export type ItemImportado = {
  codigo: string; // código do produto no fornecedor
  ean: string;
  titulo: string;
  marca: string;
  quantidade: number;
  custoCentavos: number | null; // por unidade
  precoCentavos: number | null; // preço de venda, se a planilha trouxer
};

export type NotaFiscal = { fornecedor: { nome: string; documento: string }; numero: string; chave: string; itens: ItemImportado[] };

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodificar = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTIDADES[e] ?? m),
  );

// conteúdo da primeira <tag> dentro de `xml` (sem prefixo de namespace), já sem entidades
function tag(xml: string, nome: string): string {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`));
  return m ? decodificar(m[1].trim()) : "";
}

const limparEan = (s: string) => {
  const d = s.replace(/\D/g, "");
  return /^\d{8}$|^\d{12,14}$/.test(d) ? d : ""; // "SEM GTIN" e lixo ficam vazios
};
const espacos = (s: string) => s.replace(/\s+/g, " ").trim();

export function centavosDaNota(v: string): number | null {
  const n = Number(v); // a NF-e usa ponto decimal sempre
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

// NF-e (modelo 55) de compra, com ou sem o envelope nfeProc. null se não for uma NF-e.
export function lerNfe(xml: string): NotaFiscal | null {
  const inf = xml.match(/<(?:\w+:)?infNFe\b[^>]*>([\s\S]*?)<\/(?:\w+:)?infNFe>/);
  if (!inf) return null;
  const chave = (inf[0].match(/Id="NFe(\d{44})"/) ?? [])[1] ?? "";
  const emit = tag(inf[1], "emit");
  const itens: ItemImportado[] = [];
  for (const det of inf[1].matchAll(/<(?:\w+:)?det\b[^>]*>([\s\S]*?)<\/(?:\w+:)?det>/g)) {
    const prod = tag(det[1], "prod");
    if (!prod) continue;
    const quantidade = Number(tag(prod, "qCom"));
    itens.push({
      codigo: espacos(tag(prod, "cProd")).slice(0, 60),
      ean: limparEan(tag(prod, "cEAN")) || limparEan(tag(prod, "cEANTrib")),
      titulo: espacos(tag(prod, "xProd")).slice(0, 200),
      marca: "",
      quantidade: Number.isFinite(quantidade) && quantidade > 0 ? Math.round(quantidade) : 0,
      custoCentavos: centavosDaNota(tag(prod, "vUnCom")),
      precoCentavos: null,
    });
  }
  if (!itens.length) return null;
  return {
    fornecedor: { nome: espacos(tag(emit, "xFant") || tag(emit, "xNome")).slice(0, 120), documento: (tag(emit, "CNPJ") || tag(emit, "CPF")).replace(/\D/g, "") },
    numero: tag(tag(inf[1], "ide"), "nNF"),
    chave,
    itens,
  };
}

// ---------- planilha ----------

// CSV como o Excel brasileiro salva (ponto e vírgula) ou com vírgula/tab; aspas com "" dentro.
export function lerCsv(texto: string): { colunas: string[]; linhas: string[][] } {
  const t = texto.replace(/^﻿/, "");
  const primeira = t.split(/\r?\n/, 1)[0] ?? "";
  const conta = (c: string) => primeira.split(c).length - 1;
  const sep = [";", "\t", ","].sort((a, b) => conta(b) - conta(a))[0];
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') (campo += '"'), i++;
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"' && campo === "") aspas = true;
    else if (c === sep) linha.push(campo), (campo = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo);
      if (linha.some((x) => x.trim())) linhas.push(linha);
      (linha = []), (campo = "");
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  const [cab = [], ...resto] = linhas;
  return { colunas: cab.map((c) => espacos(c)), linhas: resto };
}

export const CAMPOS = ["titulo", "codigo", "ean", "quantidade", "custo", "preco", "marca"] as const;
export type Campo = (typeof CAMPOS)[number];
export const NOMES_CAMPOS: Record<Campo, string> = {
  titulo: "Nome do produto",
  codigo: "Código no fornecedor",
  ean: "Código de barras (EAN)",
  quantidade: "Quantidade",
  custo: "Custo por unidade",
  preco: "Preço de venda",
  marca: "Marca",
};

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// em ordem: "código de barras" antes de "código", "preço de custo" antes de "preço"
const PISTAS: [Campo, RegExp][] = [
  ["ean", /\b(ean|gtin)\b|barra/],
  ["custo", /custo|compra|atacado|unitari|vl\.? ?unit|valor unit/],
  ["preco", /venda|varejo|sugerid|\bpvp\b|preco/],
  ["quantidade", /quant|\bqtd|\bqtde|estoque|saldo|\bqt\b/],
  ["codigo", /codigo|\bcod\b|\bcod\.|\bsku\b|\bref|referencia/],
  ["marca", /marca|fabricante/],
  ["titulo", /descri|produto|nome|titulo|\bitem\b/],
];

// Liga cada campo do Plist a uma coluna da planilha pelo nome do cabeçalho. Cada coluna serve a um campo só.
export function adivinharColunas(colunas: string[]): Partial<Record<Campo, string>> {
  const mapa: Partial<Record<Campo, string>> = {};
  const usadas = new Set<string>();
  for (const [campo, pista] of PISTAS) {
    const c = colunas.find((x) => x && !usadas.has(x) && pista.test(normal(x)));
    if (c) (mapa[campo] = c), usadas.add(c);
  }
  return mapa;
}

// "R$ 1.234,56", "1234.56", "10,9" → centavos
export function centavosBr(v: string): number | null {
  let s = v.replace(/[^\d,.-]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function itensDaPlanilha(colunas: string[], linhas: string[][], mapa: Partial<Record<Campo, string>>): ItemImportado[] {
  const idx = (c: Campo) => (mapa[c] ? colunas.indexOf(mapa[c]!) : -1);
  const ler = (l: string[], c: Campo) => (idx(c) >= 0 ? espacos(l[idx(c)] ?? "") : "");
  return linhas
    .map((l) => {
      const q = centavosBr(ler(l, "quantidade"));
      return {
        codigo: ler(l, "codigo").slice(0, 60),
        ean: limparEan(ler(l, "ean")),
        titulo: ler(l, "titulo").slice(0, 200),
        marca: ler(l, "marca").slice(0, 80),
        quantidade: q == null ? 0 : Math.round(q / 100),
        custoCentavos: centavosBr(ler(l, "custo")),
        precoCentavos: centavosBr(ler(l, "preco")),
      };
    })
    .filter((i) => i.titulo.length >= 3);
}

// Conferência no servidor do que veio do navegador: tipos, tamanhos e limites.
export function conferirItens(bruto: unknown, maximo = 500): ItemImportado[] {
  if (!Array.isArray(bruto)) return [];
  const txt = (v: unknown, max: number) => (typeof v === "string" ? espacos(v).slice(0, max) : "");
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), max) : null);
  return bruto
    .slice(0, maximo)
    .map((b) => {
      const o = (b ?? {}) as Record<string, unknown>;
      return {
        codigo: txt(o.codigo, 60),
        ean: limparEan(txt(o.ean, 20)),
        titulo: txt(o.titulo, 200),
        marca: txt(o.marca, 80),
        quantidade: num(o.quantidade, 99_999) ?? 0,
        custoCentavos: num(o.custoCentavos, 100_000_000),
        precoCentavos: num(o.precoCentavos, 100_000_000),
      };
    })
    .filter((i) => i.titulo.length >= 3);
}
