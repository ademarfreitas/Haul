"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterDb } from "@/db/cliente";
import { campanhaEnvios, campanhas, clientes, oportunidadeEventos, oportunidades } from "@/db/schema";
import { contaComCrm } from "@/lib/crm";
import { aberta, ETAPAS, MOTIVOS_PERDA, validaCampanha, validaOportunidade, type Etapa, type MotivoPerda } from "@/lib/crm-funil";

export type Resposta = { ok?: string; erro?: string };

const texto = (f: FormData, nome: string, max = 200) => String(f.get(nome) ?? "").trim().slice(0, max);
const campos = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;

// Número sequencial por conta (#1, #2...). Sem transação no driver HTTP: tenta de novo se dois criarem juntos.
async function comNumero<T>(tabela: typeof oportunidades | typeof campanhas, contaId: string, inserir: (numero: number) => Promise<T>): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    const [{ n }] = await obterDb()
      .select({ n: sql<number>`coalesce(max(${tabela.numero}), 0) + 1` })
      .from(tabela)
      .where(eq(tabela.contaId, contaId));
    try {
      return await inserir(Number(n));
    } catch (e) {
      if (tentativa >= 3 || !String((e as { cause?: { code?: string } })?.cause?.code ?? (e as { code?: string })?.code).includes("23505")) throw e;
    }
  }
}

async function daConta(contaId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [o] = await obterDb()
    .select()
    .from(oportunidades)
    .where(and(eq(oportunidades.id, id), eq(oportunidades.contaId, contaId)));
  return o ?? null;
}

export async function salvarOportunidade(_: Resposta, f: FormData): Promise<Resposta> {
  const atual = await contaComCrm();
  if (!atual) return { erro: "O CRM é do plano Avançado." };
  const v = validaOportunidade(campos(f));
  if ("erro" in v) return v;
  const d = v.ok;
  const db = obterDb();
  if (d.clienteId) {
    const [c] = await db.select({ id: clientes.id }).from(clientes).where(and(eq(clientes.id, d.clienteId), eq(clientes.contaId, atual.conta.id)));
    if (!c) return { erro: "Cliente não encontrado." };
  }
  const id = texto(f, "id", 40);
  if (id) {
    const o = await daConta(atual.conta.id, id);
    if (!o) return { erro: "Oportunidade não encontrada." };
    if (!aberta(o.etapa)) return { erro: "Oportunidade fechada. Reabra para editar." };
    await db
      .update(oportunidades)
      .set({
        titulo: d.titulo,
        valorCentavos: d.valorCentavos,
        origem: d.origem,
        proximaAcao: d.proximaAcao,
        proximaData: d.proximaData,
        ...(o.clienteId ? {} : { contatoNome: d.contatoNome ?? o.contatoNome, contatoWhatsapp: d.contatoWhatsapp ?? o.contatoWhatsapp }),
      })
      .where(eq(oportunidades.id, o.id));
    if (d.etapa !== o.etapa) await mudarEtapa(atual.conta.id, o, d.etapa, atual.usuario.id);
    revalidatePath(`/crm/oportunidades/${o.id}`);
    return { ok: "Salvo." };
  }
  const nova = await comNumero(oportunidades, atual.conta.id, async (numero) => {
    const [o] = await db
      .insert(oportunidades)
      .values({ contaId: atual.conta.id, numero, ...d, criadoPor: atual.usuario.id })
      .returning({ id: oportunidades.id });
    return o;
  });
  await db.insert(oportunidadeEventos).values({ contaId: atual.conta.id, oportunidadeId: nova.id, para: d.etapa, texto: "criada", usuarioId: atual.usuario.id });
  redirect(`/crm/oportunidades/${nova.id}`);
}

// Muda de etapa. Ganhar um contato solto cria (ou acha pelo WhatsApp) o cliente próprio.
async function mudarEtapa(
  contaId: string,
  o: typeof oportunidades.$inferSelect,
  para: Etapa,
  usuarioId: string,
  motivo: { motivo?: MotivoPerda; texto?: string } = {},
) {
  const db = obterDb();
  let clienteId = o.clienteId;
  if (para === "ganho" && !clienteId) {
    const [achado] = o.contatoWhatsapp
      ? await db.select({ id: clientes.id }).from(clientes).where(and(eq(clientes.contaId, contaId), eq(clientes.whatsapp, o.contatoWhatsapp))).limit(1)
      : [];
    clienteId =
      achado?.id ??
      (
        await db
          .insert(clientes)
          .values({ contaId, nome: o.contatoNome ?? "Cliente", whatsapp: o.contatoWhatsapp, origem: o.origem })
          .returning({ id: clientes.id })
      )[0].id;
  }
  const fecha = para === "ganho" || para === "perdido";
  await db
    .update(oportunidades)
    .set({
      etapa: para,
      etapaDesde: new Date(),
      clienteId,
      fechadoEm: fecha ? new Date() : null,
      motivoPerda: para === "perdido" ? motivo.motivo : null,
      motivoTexto: para === "perdido" ? motivo.texto || null : null,
      ...(fecha ? { proximaData: null, proximaAcao: null } : {}),
    })
    .where(eq(oportunidades.id, o.id));
  await db.insert(oportunidadeEventos).values({
    contaId,
    oportunidadeId: o.id,
    de: o.etapa,
    para,
    texto: para === "perdido" && motivo.motivo ? `${MOTIVOS_PERDA[motivo.motivo]}${motivo.texto ? `: ${motivo.texto}` : ""}` : null,
    usuarioId,
  });
}

// Do quadro (arrastar ou "Mover") e dos botões da oportunidade. Perder sem motivo leva à tela que pergunta.
export async function moverOportunidade(f: FormData): Promise<void> {
  const atual = await contaComCrm();
  if (!atual) return;
  const o = await daConta(atual.conta.id, texto(f, "id", 40));
  const para = texto(f, "para", 20);
  if (!o || !Object.hasOwn(ETAPAS, para) || o.etapa === para) return;
  if (para === "perdido") {
    const motivo = texto(f, "motivo", 20);
    if (!Object.hasOwn(MOTIVOS_PERDA, motivo)) redirect(`/crm/oportunidades/${o.id}?perder=1`);
    await mudarEtapa(atual.conta.id, o, "perdido", atual.usuario.id, { motivo: motivo as MotivoPerda, texto: texto(f, "motivoTexto", 300) });
  } else await mudarEtapa(atual.conta.id, o, para as Etapa, atual.usuario.id);
  revalidatePath("/crm/funil");
  revalidatePath(`/crm/oportunidades/${o.id}`);
  if (texto(f, "volta", 60) === "oportunidade") redirect(`/crm/oportunidades/${o.id}`);
}

export async function anotarOportunidade(f: FormData): Promise<void> {
  const atual = await contaComCrm();
  if (!atual) return;
  const o = await daConta(atual.conta.id, texto(f, "id", 40));
  const nota = texto(f, "texto", 300);
  if (!o || !nota) return;
  await obterDb().insert(oportunidadeEventos).values({ contaId: atual.conta.id, oportunidadeId: o.id, para: o.etapa, de: o.etapa, texto: nota, usuarioId: atual.usuario.id });
  revalidatePath(`/crm/oportunidades/${o.id}`);
}

// ---------- campanhas ----------

export async function criarCampanha(_: Resposta, f: FormData): Promise<Resposta> {
  const atual = await contaComCrm();
  if (!atual) return { erro: "O CRM é do plano Avançado." };
  const v = validaCampanha(campos(f));
  if ("erro" in v) return v;
  const nova = await comNumero(campanhas, atual.conta.id, async (numero) => {
    const [c] = await obterDb()
      .insert(campanhas)
      .values({ contaId: atual.conta.id, numero, ...v.ok, criadoPor: atual.usuario.id })
      .returning({ id: campanhas.id });
    return c;
  });
  redirect(`/crm/campanhas/${nova.id}`);
}

// Marca como enviado (ou desmarca) quem o lojista já chamou no WhatsApp.
export async function marcarEnvio(f: FormData): Promise<void> {
  const atual = await contaComCrm();
  if (!atual) return;
  const campanhaId = texto(f, "campanha", 40);
  const clienteId = texto(f, "cliente", 40);
  const db = obterDb();
  const [c] = await db.select({ id: campanhas.id }).from(campanhas).where(and(eq(campanhas.id, campanhaId), eq(campanhas.contaId, atual.conta.id)));
  const [cl] = await db.select({ id: clientes.id }).from(clientes).where(and(eq(clientes.id, clienteId), eq(clientes.contaId, atual.conta.id)));
  if (!c || !cl) return;
  if (f.get("desfazer") === "1") await db.delete(campanhaEnvios).where(and(eq(campanhaEnvios.campanhaId, c.id), eq(campanhaEnvios.clienteId, cl.id)));
  else await db.insert(campanhaEnvios).values({ campanhaId: c.id, clienteId: cl.id }).onConflictDoNothing();
  revalidatePath(`/crm/campanhas/${c.id}`);
}
