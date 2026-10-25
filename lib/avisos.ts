// Avisos de custo e estoque: viram tarefa em Tarefas e, se o lojista deixou ligado em Avisos, e-mail (Resend).
// Não dependem do SMS. Uma tarefa aberta por peça e tipo: um aviso novo atualiza a que já existe.
import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, contas, pecas, tarefas, usuarios } from "@/db/schema";
import { avisoDeCusto, avisoDeEstoque, emailDeAvisos } from "@/lib/avisos-texto";
import { CANAIS, type Canal } from "@/lib/canais";
import { emailConfigurado, enviarEmail } from "@/lib/email";

type Tipo = "conferir_custo" | "repor_estoque";
type Aviso = { pecaId: string; titulo: string; detalhe: string };

async function gravar(contaId: string, tipo: Tipo, avisos: Aviso[]): Promise<Aviso[]> {
  if (!avisos.length) return [];
  const db = obterDb();
  const abertas = await db
    .select({ id: tarefas.id, pecaId: tarefas.pecaId })
    .from(tarefas)
    .where(and(eq(tarefas.contaId, contaId), eq(tarefas.tipo, tipo), eq(tarefas.situacao, "aberta"), inArray(tarefas.pecaId, avisos.map((a) => a.pecaId))));
  const porPeca = new Map(abertas.map((t) => [t.pecaId, t.id]));
  const novos: Aviso[] = [];
  for (const a of avisos) {
    const ja = porPeca.get(a.pecaId);
    if (ja) {
      // custo: o texto novo substitui o antigo; estoque: já avisou, não repete
      if (tipo === "conferir_custo") await db.update(tarefas).set({ titulo: a.titulo, detalhe: a.detalhe }).where(eq(tarefas.id, ja));
      if (tipo === "repor_estoque") continue;
    } else {
      await db.insert(tarefas).values({ contaId, tipo, titulo: a.titulo, detalhe: a.detalhe, pecaId: a.pecaId });
    }
    novos.push(a);
  }
  return novos;
}

async function mandarEmail(contaId: string, tipo: Tipo, avisos: Aviso[]): Promise<void> {
  if (!avisos.length || !emailConfigurado()) return;
  const db = obterDb();
  const [conta] = await db.select({ avisosEmail: contas.avisosEmail }).from(contas).where(eq(contas.id, contaId));
  const chave = tipo === "conferir_custo" ? "custo" : "estoque";
  if (conta?.avisosEmail?.[chave] === false) return;
  const para = await db.select({ email: usuarios.email }).from(usuarios).where(eq(usuarios.contaId, contaId));
  const link = `${(process.env.APP_URL ?? "https://app.plist.com.br").replace(/\/$/, "")}/tarefas`;
  const { assunto, texto, html } = emailDeAvisos(avisos, link);
  for (const u of para) {
    try {
      await enviarEmail(u.email, assunto, texto, html);
    } catch (e) {
      console.error("e-mail de aviso falhou:", e instanceof Error ? e.message : e);
    }
  }
}

export type MudancaDeCusto = { pecaId: string; titulo: string; antes: number; depois: number };

// O fornecedor cobrou mais numa nota ou planilha nova. `origem`: "nota 1234 de Fulano", "planilha de Fulano".
export async function avisarCustos(contaId: string, mudancas: MudancaDeCusto[], origem: string): Promise<void> {
  const subiram = mudancas.filter((m) => m.depois > m.antes);
  if (!subiram.length) return;
  const noAr = await obterDb()
    .select({ pecaId: anuncios.pecaId, canal: anuncios.canal, preco: anuncios.precoCentavos, taxa: anuncios.taxaEstimadaCentavos })
    .from(anuncios)
    .where(and(inArray(anuncios.pecaId, subiram.map((m) => m.pecaId)), inArray(anuncios.situacao, ["ativo", "pausado"])));
  const avisos = subiram.map((m) => ({
    pecaId: m.pecaId,
    ...avisoDeCusto({
      ...m,
      origem,
      anuncios: noAr.filter((a) => a.pecaId === m.pecaId).map((a) => ({ canal: CANAIS[a.canal as Canal].nome, precoCentavos: a.preco, taxaCentavos: a.taxa })),
    }),
  }));
  await mandarEmail(contaId, "conferir_custo", await gravar(contaId, "conferir_custo", avisos));
}

// Peças no estoque mínimo ou abaixo (só as que têm mínimo definido). Por conta (ao abrir Tarefas, depois de
// importar) ou por peças (depois de uma venda). Nunca lança.
export async function conferirEstoqueBaixo(alvo: { contaId?: string; pecaIds?: string[] }): Promise<void> {
  try {
    const filtros = [isNotNull(pecas.estoqueMinimo), lte(pecas.quantidade, sql`${pecas.estoqueMinimo}`), inArray(pecas.situacao, ["disponivel", "reservada", "vendida", "rascunho"])];
    if (alvo.contaId) filtros.push(eq(pecas.contaId, alvo.contaId));
    if (alvo.pecaIds?.length) filtros.push(inArray(pecas.id, alvo.pecaIds));
    if (!alvo.contaId && !alvo.pecaIds?.length) return;
    const baixas = await obterDb()
      .select({ id: pecas.id, contaId: pecas.contaId, titulo: pecas.titulo, quantidade: pecas.quantidade, minimo: pecas.estoqueMinimo })
      .from(pecas)
      .where(and(...filtros))
      .limit(200);
    const porConta = new Map<string, Aviso[]>();
    for (const p of baixas) {
      const lista = porConta.get(p.contaId) ?? [];
      lista.push({ pecaId: p.id, ...avisoDeEstoque({ titulo: p.titulo, quantidade: p.quantidade, minimo: p.minimo ?? 0 }) });
      porConta.set(p.contaId, lista);
    }
    for (const [contaId, avisos] of porConta) await mandarEmail(contaId, "repor_estoque", await gravar(contaId, "repor_estoque", avisos));
  } catch (e) {
    console.error("conferir estoque baixo falhou:", e);
  }
}
