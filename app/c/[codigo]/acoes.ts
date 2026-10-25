"use server";
// Cadastro do comprador na página da loja (/c/<codigo>). Público: não tem sessão, a loja vem do código.
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { clientes, contas, pedidos } from "@/db/schema";
import { ligarPedidosAClientes, temCrm } from "@/lib/crm";
import { codigoValido, completa, DE, deValido, validaCadastro } from "@/lib/crm-captacao";

export type EstadoCadastro = { erro?: string; feito?: { cupom: string | null; beneficio: string | null }; valores?: Record<string, string> };

export async function cadastrarNaLoja(_: EstadoCadastro, f: FormData): Promise<EstadoCadastro> {
  const campos = Object.fromEntries([...f.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  const codigo = campos.codigo;
  const de = deValido(campos.de);
  if (!codigoValido(codigo)) return { erro: "Página não encontrada." };
  const db = obterDb();
  const [conta] = await db
    .select({ id: contas.id, plano: contas.plano, situacaoAssinatura: contas.situacaoAssinatura, testeAte: contas.testeAte, cupom: contas.captacaoCupom, beneficio: contas.captacaoBeneficio })
    .from(contas)
    .where(eq(contas.captacaoCodigo, codigo));
  if (!conta || !temCrm(conta)) return { erro: "Esta página de cadastro não está mais ativa." };
  const feito = { cupom: DE[de].cupom ? conta.cupom : null, beneficio: DE[de].cupom ? conta.beneficio : null };
  // campo escondido que só robô preenche: finge que deu certo e não guarda nada
  if (campos.site) return { feito };

  const v = validaCadastro(campos);
  if ("erro" in v) return { erro: v.erro, valores: campos };
  const novo = v.ok;
  const aceite = { ofertasAceiteEm: new Date(), ofertasOrigem: DE[de].origem };

  // 1) pelo número do pedido: junta o contato ao comprador do marketplace, com o histórico de compras
  let alvo: typeof clientes.$inferSelect | undefined;
  if (novo.pedido) {
    await ligarPedidosAClientes(conta.id);
    const [p] = await db
      .select({ c: clientes })
      .from(pedidos)
      .innerJoin(clientes, eq(clientes.id, pedidos.clienteId))
      .where(and(eq(pedidos.contaId, conta.id), eq(pedidos.idExterno, novo.pedido)))
      .limit(1);
    // se esse comprador já tem outro WhatsApp, não mexe nele (pode ser alguém digitando o pedido de outra pessoa)
    if (p && (!p.c.whatsapp || p.c.whatsapp === novo.whatsapp)) alvo = p.c;
  }
  // 2) pelo WhatsApp: a pessoa já é cliente da loja
  if (!alvo) {
    [alvo] = await db
      .select()
      .from(clientes)
      .where(and(eq(clientes.contaId, conta.id), eq(clientes.whatsapp, novo.whatsapp)))
      .limit(1);
  }
  // comprador de marketplace: troca o apelido pelo nome que a pessoa digitou
  if (alvo) {
    await db
      .update(clientes)
      .set({ ...completa(alvo, novo), ...aceite, ...(alvo.canal && alvo.canal !== "venda_direta" ? { nome: novo.nome } : {}) })
      .where(eq(clientes.id, alvo.id));
  } else {
    await db.insert(clientes).values({
      contaId: conta.id,
      nome: novo.nome,
      whatsapp: novo.whatsapp,
      email: novo.email,
      aniversario: novo.aniversario,
      origem: de === "pacote" ? "marketplace" : "site",
      ...aceite,
    });
  }
  return { feito };
}
