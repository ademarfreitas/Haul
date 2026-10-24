"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterDb } from "@/db/cliente";
import { clienteEtiquetas, clienteNotas, clientes, pecas, pedidos } from "@/db/schema";
import { clienteProprio, contaComCrm } from "@/lib/crm";
import { centavosDito, dataValida } from "@/lib/crm-funil";
import { diaSP, etiquetaValida, ORIGENS } from "@/lib/crm-medidas";
import { acompanharVenda } from "@/lib/multivenda";
import { celularE164, emailValido } from "@/lib/validar";

export type Resposta = { ok?: string; erro?: string };

const texto = (f: FormData, nome: string, max = 200) => String(f.get(nome) ?? "").trim().slice(0, max);

// o cliente tem de ser da conta de quem está usando
async function doCliente(contaId: string, id: string) {
  const [c] = await obterDb()
    .select({ id: clientes.id, canal: clientes.canal, ofertasAceiteEm: clientes.ofertasAceiteEm })
    .from(clientes)
    .where(and(eq(clientes.id, id), eq(clientes.contaId, contaId)));
  return c ?? null;
}

// Cadastro e edição do cliente próprio.
export async function salvarCliente(_: Resposta, f: FormData): Promise<Resposta> {
  const atual = await contaComCrm();
  if (!atual) return { erro: "O CRM é do plano Avançado." };
  const id = texto(f, "id", 40);
  const nome = texto(f, "nome", 120).replace(/\s+/g, " ");
  const zap = texto(f, "whatsapp", 30);
  const email = texto(f, "email", 254).toLowerCase();
  const aniversario = texto(f, "aniversario", 10);
  const origem = texto(f, "origem", 20);
  const aceita = f.get("ofertas") === "on";
  const comoAceitou = texto(f, "ofertasOrigem", 80);

  if (!nome) return { erro: "Escreva o nome do cliente." };
  const whatsapp = zap ? celularE164(zap) : null;
  if (zap && !whatsapp) return { erro: "Digite o WhatsApp com DDD, por exemplo (11) 91234-5678." };
  if (email && !emailValido(email)) return { erro: "Esse e-mail não parece certo." };
  if (aniversario && !dataValida(aniversario)) return { erro: "Data de aniversário inválida." };
  if (origem && !Object.hasOwn(ORIGENS, origem)) return { erro: "Origem inválida." };
  if (aceita && !whatsapp && !email) return { erro: "Para receber ofertas, o cliente precisa de WhatsApp ou e-mail." };

  const db = obterDb();
  const antes = id ? await doCliente(atual.conta.id, id) : null;
  if (id && !antes) return { erro: "Cliente não encontrado." };
  // comprador de marketplace: o canal não deixa usar o contato para marketing (docs/crm.md)
  if (antes && !clienteProprio(antes)) return { erro: "Os dados do comprador de marketplace vêm do canal." };
  const dados = {
    nome,
    whatsapp: whatsapp?.replace("+", "") ?? null,
    email: email || null,
    aniversario: aniversario || null,
    origem: (origem || null) as keyof typeof ORIGENS | null,
    // LGPD: guarda quando e como o cliente aceitou; desmarcar apaga
    ofertasAceiteEm: aceita ? (antes?.ofertasAceiteEm ?? new Date()) : null,
    ofertasOrigem: aceita ? comoAceitou || null : null,
  };
  if (antes) {
    await db.update(clientes).set(dados).where(eq(clientes.id, antes.id));
    revalidatePath(`/crm/${antes.id}`);
    return { ok: "Salvo." };
  }
  const [novo] = await db.insert(clientes).values({ contaId: atual.conta.id, ...dados }).returning({ id: clientes.id });
  redirect(`/crm/${novo.id}`);
}

export async function salvarProximoPasso(f: FormData): Promise<void> {
  const atual = await contaComCrm();
  if (!atual) return;
  const c = await doCliente(atual.conta.id, texto(f, "id", 40));
  if (!c) return;
  const limpar = f.get("limpar") === "1";
  const quando = limpar ? null : dataValida(texto(f, "quando", 10));
  const passo = limpar ? null : texto(f, "passo", 200) || null;
  await obterDb().update(clientes).set({ proximoContato: quando, proximoPasso: passo }).where(eq(clientes.id, c.id));
  revalidatePath(`/crm/${c.id}`);
}

export async function adicionarEtiqueta(_: Resposta, f: FormData): Promise<Resposta> {
  const atual = await contaComCrm();
  if (!atual) return { erro: "O CRM é do plano Avançado." };
  const c = await doCliente(atual.conta.id, texto(f, "id", 40));
  if (!c) return { erro: "Cliente não encontrado." };
  const v = etiquetaValida(texto(f, "etiqueta", 60));
  if ("erro" in v) return v;
  await obterDb().insert(clienteEtiquetas).values({ clienteId: c.id, contaId: atual.conta.id, etiqueta: v.ok }).onConflictDoNothing();
  revalidatePath(`/crm/${c.id}`);
  return {};
}

export async function removerEtiqueta(f: FormData): Promise<void> {
  const atual = await contaComCrm();
  if (!atual) return;
  const c = await doCliente(atual.conta.id, texto(f, "id", 40));
  if (!c) return;
  await obterDb()
    .delete(clienteEtiquetas)
    .where(and(eq(clienteEtiquetas.clienteId, c.id), eq(clienteEtiquetas.etiqueta, texto(f, "etiqueta", 30))));
  revalidatePath(`/crm/${c.id}`);
}

export async function adicionarNota(f: FormData): Promise<void> {
  const atual = await contaComCrm();
  if (!atual) return;
  const c = await doCliente(atual.conta.id, texto(f, "id", 40));
  const nota = texto(f, "texto", 1000);
  if (!c || !nota) return;
  await obterDb().insert(clienteNotas).values({ contaId: atual.conta.id, clienteId: c.id, texto: nota, usuarioId: atual.usuario.id });
  revalidatePath(`/crm/${c.id}`);
}

// Venda direta para um cliente próprio (bazar, Instagram, loja): vira pedido do Plist. Se for uma peça do
// estoque, baixa a quantidade e tira dos outros canais, como numa venda de marketplace.
export async function registrarVendaDireta(_: Resposta, f: FormData): Promise<Resposta> {
  const atual = await contaComCrm();
  if (!atual) return { erro: "O CRM é do plano Avançado." };
  const c = await doCliente(atual.conta.id, texto(f, "id", 40));
  if (!c || !clienteProprio(c)) return { erro: "Venda direta só para cliente próprio." };
  const valor = centavosDito(texto(f, "valor", 20));
  if (!(valor > 0)) return { erro: "Digite o valor da venda." };
  const hoje = diaSP(new Date());
  const dia = dataValida(texto(f, "dia", 10)) ?? hoje;
  if (dia > hoje) return { erro: "A data não pode ser no futuro." };
  const db = obterDb();
  const pecaId = texto(f, "peca", 40) || null;
  if (pecaId) {
    const [p] = await db
      .select({ id: pecas.id })
      .from(pecas)
      .where(and(eq(pecas.id, pecaId), eq(pecas.contaId, atual.conta.id), eq(pecas.situacao, "disponivel")));
    if (!p) return { erro: "Essa peça não está mais disponível." };
  }
  await db.insert(pedidos).values({
    contaId: atual.conta.id,
    canal: "venda_direta",
    clienteId: c.id,
    pecaId,
    situacao: "entregue",
    logistica: "propria",
    valorVendaCentavos: valor,
    vendidoEm: dia === hoje ? new Date() : new Date(`${dia}T15:00:00Z`), // hoje: a hora certa conta para o retorno das campanhas
    entregueEm: new Date(),
  });
  if (pecaId) {
    await db.execute(sql`
      update pecas set quantidade = greatest(quantidade - 1, 0),
        situacao = case when quantidade - 1 <= 0 then 'vendida'::situacao_peca else situacao end
      where id = ${pecaId}`);
    await acompanharVenda(pecaId, "venda_direta");
  }
  revalidatePath(`/crm/${c.id}`);
  return { ok: pecaId ? "Venda registrada. A peça saiu dos outros canais." : "Venda registrada." };
}
