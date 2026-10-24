// Funil de vendas e campanhas do CRM: regras puras (os testes chamam direto).
import { celularE164 } from "@/lib/validar";
import { ORIGENS, SEGMENTOS, type Segmento } from "@/lib/crm-medidas";

export const ETAPAS = {
  contato: { rotulo: "Contato", prob: 10, dica: "Alguém pediu informação." },
  qualificado: { rotulo: "Qualificado", prob: 30, dica: "Tem interesse, dinheiro e prazo." },
  proposta: { rotulo: "Proposta enviada", prob: 50, dica: "Esperando a resposta." },
  negociacao: { rotulo: "Negociando", prob: 70, dica: "Ajustando preço, prazo ou condição." },
  ganho: { rotulo: "Ganho", prob: 100, dica: "Fechou." },
  perdido: { rotulo: "Perdido", prob: 0, dica: "Não fechou." },
} as const;
export type Etapa = keyof typeof ETAPAS;
export const ABERTAS = ["contato", "qualificado", "proposta", "negociacao"] as const;
export type EtapaAberta = (typeof ABERTAS)[number];
export const aberta = (e: string): e is EtapaAberta => (ABERTAS as readonly string[]).includes(e);

export const MOTIVOS_PERDA = {
  preco: "Achou caro",
  prazo: "Prazo não serviu",
  concorrente: "Fechou com outro",
  desistiu: "Desistiu / adiou",
  sem_resposta: "Parou de responder",
  outro: "Outro motivo",
} as const;
export type MotivoPerda = keyof typeof MOTIVOS_PERDA;

const limpa = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
export const dataValida = (v: unknown) => {
  const s = String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) ? s : null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "1.234,56", "1234.5", "R$ 300" → centavos; vazio = 0; inválido = NaN
export function centavosDito(t: unknown): number {
  let s = String(t ?? "").replace(/[R$\s]/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export type DadosOportunidade = {
  titulo: string;
  clienteId: string | null;
  contatoNome: string | null;
  contatoWhatsapp: string | null;
  valorCentavos: number;
  etapa: EtapaAberta;
  origem: keyof typeof ORIGENS | null;
  proximaAcao: string | null;
  proximaData: string | null;
};

export function validaOportunidade(f: Record<string, unknown>): { erro: string } | { ok: DadosOportunidade } {
  const titulo = limpa(f.titulo, 120);
  if (!titulo) return { erro: 'Diga o que a pessoa quer (ex.: "3 vestidos de festa para sábado").' };
  const clienteId = UUID.test(String(f.clienteId ?? "")) ? String(f.clienteId) : null;
  const contatoNome = clienteId ? null : limpa(f.contatoNome, 80) || null;
  if (!clienteId && !contatoNome) return { erro: "Escolha o cliente ou escreva o nome de quem pediu." };
  const zap = clienteId ? "" : limpa(f.contatoWhatsapp, 30);
  const e164 = zap ? celularE164(zap) : null;
  if (zap && !e164) return { erro: "WhatsApp com DDD, por exemplo (11) 91234-5678." };
  const valorCentavos = centavosDito(f.valor);
  if (Number.isNaN(valorCentavos) || valorCentavos < 0) return { erro: "Valor inválido." };
  const etapa = aberta(String(f.etapa)) ? (f.etapa as EtapaAberta) : "contato";
  const origem = Object.hasOwn(ORIGENS, String(f.origem)) ? (f.origem as keyof typeof ORIGENS) : null;
  const proximaData = f.proximaData ? dataValida(f.proximaData) : null;
  if (f.proximaData && !proximaData) return { erro: "Data inválida." };
  return {
    ok: {
      titulo,
      clienteId,
      contatoNome,
      contatoWhatsapp: e164 ? e164.slice(1) : null,
      valorCentavos,
      etapa,
      origem,
      proximaAcao: limpa(f.proximaAcao, 200) || null,
      proximaData,
    },
  };
}

type LinhaFunil = { etapa: Etapa; valorCentavos: number; origem: string | null; motivoPerda: string | null; criadoEm: Date; fechadoEm: Date | null; proximaData: string | null };

// Os números do funil: o que está aberto agora e o que fechou entre `de` e `ate` (AAAA-MM-DD, horário de Brasília).
export function resumoDoFunil(linhas: LinhaFunil[], { de, ate, hoje }: { de: string; ate: string; hoje: string }) {
  const dia = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const noPeriodo = (o: LinhaFunil) => !!o.fechadoEm && dia(o.fechadoEm) >= de && dia(o.fechadoEm) <= ate;
  const abertas = linhas.filter((o) => aberta(o.etapa));
  const ganhas = linhas.filter((o) => o.etapa === "ganho" && noPeriodo(o));
  const perdidas = linhas.filter((o) => o.etapa === "perdido" && noPeriodo(o));
  const soma = (l: LinhaFunil[]) => l.reduce((s, o) => s + o.valorCentavos, 0);
  const porEtapa = Object.fromEntries(ABERTAS.map((e) => [e, { quantas: 0, valor: 0 }])) as Record<EtapaAberta, { quantas: number; valor: number }>;
  for (const o of abertas) {
    porEtapa[o.etapa as EtapaAberta].quantas++;
    porEtapa[o.etapa as EtapaAberta].valor += o.valorCentavos;
  }
  const motivos: Partial<Record<MotivoPerda, number>> = {};
  for (const o of perdidas) if (o.motivoPerda) motivos[o.motivoPerda as MotivoPerda] = (motivos[o.motivoPerda as MotivoPerda] ?? 0) + 1;
  const porOrigem: Record<string, { ganhas: number; perdidas: number; valor: number }> = {};
  for (const o of [...ganhas, ...perdidas]) {
    const k = o.origem ?? "sem";
    porOrigem[k] ??= { ganhas: 0, perdidas: 0, valor: 0 };
    if (o.etapa === "ganho") {
      porOrigem[k].ganhas++;
      porOrigem[k].valor += o.valorCentavos;
    } else porOrigem[k].perdidas++;
  }
  const dias = (o: LinhaFunil) => Math.max(0, Math.round(((o.fechadoEm?.getTime() ?? 0) - o.criadoEm.getTime()) / 86_400_000));
  return {
    abertas: abertas.length,
    valorAberto: soma(abertas),
    previsto: Math.round(abertas.reduce((s, o) => s + (o.valorCentavos * ETAPAS[o.etapa].prob) / 100, 0)),
    ganhas: ganhas.length,
    valorGanho: soma(ganhas),
    perdidas: perdidas.length,
    conversao: ganhas.length + perdidas.length ? Math.round((ganhas.length / (ganhas.length + perdidas.length)) * 100) : null,
    diasAteFechar: ganhas.length ? Math.round(ganhas.reduce((s, o) => s + dias(o), 0) / ganhas.length) : null,
    atrasadas: abertas.filter((o) => o.proximaData && o.proximaData < hoje).length,
    porEtapa,
    motivos,
    porOrigem,
  };
}

// ---------- campanhas ----------

export const JANELA_RETORNO = 7; // dias depois do envio em que uma compra conta como retorno

export type Filtro = { segmento?: Segmento; etiqueta?: string; cidade?: string; categoria?: string; maiores?: boolean; aniversario?: boolean };

export function filtroLimpo(f: Record<string, unknown>): Filtro {
  const x: Filtro = {};
  if (Object.hasOwn(SEGMENTOS, String(f.segmento))) x.segmento = f.segmento as Segmento;
  const etiqueta = limpa(f.etiqueta, 30).toLowerCase();
  if (etiqueta) x.etiqueta = etiqueta;
  const cidade = limpa(f.cidade, 80);
  if (cidade) x.cidade = cidade;
  const categoria = limpa(f.categoria, 80);
  if (categoria) x.categoria = categoria;
  if (f.maiores === "1" || f.maiores === true) x.maiores = true;
  if (f.aniversario === "1" || f.aniversario === true) x.aniversario = true;
  return x;
}

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

type ClienteFiltro = { id: string; segmento: Segmento; etiquetas: string[]; cidade: string | null; maior: boolean; aniversarioEm: number | null };

// `categorias`: id do cliente → categorias que ele já comprou
export function filtraClientes<T extends ClienteFiltro>(clientes: T[], f: Filtro, categorias?: Map<string, string[]>): T[] {
  return clientes.filter(
    (c) =>
      (!f.segmento || c.segmento === f.segmento) &&
      (!f.etiqueta || c.etiquetas.includes(f.etiqueta)) &&
      (!f.cidade || norm(c.cidade) === norm(f.cidade)) &&
      (!f.categoria || (categorias?.get(c.id) ?? []).some((x) => norm(x) === norm(f.categoria))) &&
      (!f.maiores || c.maior) &&
      (!f.aniversario || (c.aniversarioEm !== null && c.aniversarioEm <= 30)),
  );
}

export function validaCampanha(f: Record<string, unknown>): { erro: string } | { ok: { nome: string; mensagem: string; tipo: "oferta" | "relacionamento"; filtro: Filtro } } {
  const nome = limpa(f.nome, 80);
  if (!nome) return { erro: 'Dê um nome (ex.: "Chegou inverno").' };
  const mensagem = String(f.mensagem ?? "").replace(/\r\n/g, "\n").trim().slice(0, 1000);
  if (mensagem.length < 5) return { erro: "Escreva a mensagem." };
  return { ok: { nome, mensagem, tipo: f.tipo === "relacionamento" ? "relacionamento" : "oferta", filtro: filtroLimpo(f) } };
}

export function descreveFiltro(f: Filtro): string {
  const partes = [
    f.segmento && SEGMENTOS[f.segmento].rotulo,
    f.etiqueta && `etiqueta "${f.etiqueta}"`,
    f.categoria && `compraram ${f.categoria}`,
    f.cidade && `de ${f.cidade}`,
    f.maiores && "os 20% que mais compram",
    f.aniversario && "aniversário em 30 dias",
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Todos os clientes próprios";
}

// ---------- mensagens prontas ----------

export const MODELOS = {
  sumindo: "Oi {nome}, tudo bem? Aqui é da {empresa}. Faz um tempinho que você não aparece, sentimos sua falta! Chegou coisa nova por aqui, quer que eu te mostre?",
  perdido: "Oi {nome}! Aqui é da {empresa}. Preparamos uma condição especial para você voltar: me chama aqui que eu te conto.",
  aniversario: "Feliz aniversário, {nome}! Toda a equipe da {empresa} deseja um dia incrível. Tem um mimo te esperando aqui!",
  novo: "Oi {nome}, aqui é da {empresa}. Obrigado pela compra! Deu tudo certo? Qualquer coisa, é só chamar por aqui.",
  chegou: "Oi {nome}! Aqui é da {empresa}. Chegou {produto}, bem o seu estilo. Quer que eu separe para você?",
  contato: "Oi {nome}, aqui é da {empresa}. Tudo bem?",
} as const;

const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? "";

// Troca {nome}, {empresa}, {produto} no texto; o que não veio some sem deixar a chave.
export function preenche(texto: string, vars: Record<string, string | undefined>): string {
  return texto
    .replace(/\{(\w+)\}/g, (_, k: string) => (k === "nome" ? primeiroNome(vars.nome ?? "") : (vars[k] ?? "")))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export const linkZap = (whatsapp: string | null, mensagem: string) => (whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(mensagem)}` : null);
