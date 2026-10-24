// Traz as vendas recentes de uma loja da Magalu para Pedidos e cria as Tarefas de cada uma.
// Docs: developers.magalu.com/docs/apis/orders (GET /seller/v1/orders já traz as entregas de cada pedido).
// Taxa no 2º momento: amounts.commission do pedido; a estimada vem do anúncio.
// Etiqueta e NF-e: na Magalu a nota fiscal vem antes da etiqueta. Enquanto o envio da NF-e e a etiqueta
// pela API não forem conferidos no sandbox, a tarefa leva o lojista ao Portal do Seller.
import { and, eq, inArray, sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, pedidos, tarefas } from "@/db/schema";
import { PORTAL_SELLER_MAGALU } from "@/lib/canais";
import { desfazerVenda, registrarVenda } from "@/lib/multivenda";
import { chamarMagalu, idAnuncioMagalu, lojaMagaluValida, type Loja } from "@/lib/magalu";
import { centavosMagalu } from "@/lib/magalu-importar";
import type { ResultadoPedidos } from "@/lib/ml-pedidos";

const DIAS = 60;
const JANELA_DIAS = 15;
const POR_PAGINA = 100;
const MAXIMO = 300;
const TOLERANCIA_TAXA = 50;

type Valor = { total?: number; normalizer?: number };
type Item = { quantity?: number; unit_price?: { value?: number; normalizer?: number }; info?: { sku?: string; name?: string } };
type Entrega = {
  id: string;
  code?: string;
  status?: string; // new, approved, invoiced, shipped, delivered, cancelled
  items?: Item[];
  shipping?: {
    provider?: { id?: string; name?: string };
    handling_time?: { limit_date?: string };
    recipient?: { name?: string; address?: { city?: string; state?: string; zipcode?: string } };
    tracking_url?: string;
    posting_date?: string;
  };
  invoices?: { key?: string; status?: string }[];
};
type PedidoMagalu = {
  id: string;
  code: string;
  status: string; // new, approved, finished, cancelled
  purchased_at?: string;
  updated_at?: string;
  amounts?: Valor & { commission?: Valor; freight?: Valor };
  deliveries?: Entrega[];
};

// a situação vem da entrega (o pedido só diz novo, aprovado, finalizado ou cancelado)
function situacao(p: PedidoMagalu, e: Entrega | undefined) {
  switch (e?.status ?? p.status) {
    case "new":
      return "aguardando_pagamento" as const;
    case "approved":
      return "pago" as const; // falta NF-e e etiqueta
    case "invoiced":
      return "pronto_para_envio" as const; // NF-e aceita: etiqueta liberada
    case "shipped":
      return "enviado" as const;
    case "delivered":
    case "finished":
      return "entregue" as const;
    default:
      return "cancelado" as const;
  }
}

async function recentes(loja: Loja): Promise<PedidoMagalu[]> {
  const lista = new Map<string, PedidoMagalu>();
  const agora = Date.now();
  // a Magalu pede uma janela de datas na busca de pedidos
  for (let fim = agora; fim > agora - DIAS * 86_400_000 && lista.size < MAXIMO; fim -= JANELA_DIAS * 86_400_000) {
    const inicio = fim - JANELA_DIAS * 86_400_000;
    for (let offset = 0; lista.size < MAXIMO; offset += POR_PAGINA) {
      const r = await chamarMagalu<{ results?: PedidoMagalu[] }>("/seller/v1/orders", loja.accessToken, {
        consulta: {
          updated_at__gte: new Date(inicio).toISOString(),
          updated_at__lte: new Date(fim).toISOString(),
          _limit: POR_PAGINA,
          _offset: offset,
          _sort: "purchased_at:desc",
        },
      });
      for (const p of r.results ?? []) if (p.code && !lista.has(p.code)) lista.set(p.code, p);
      if ((r.results?.length ?? 0) < POR_PAGINA) break;
    }
  }
  return [...lista.values()].slice(0, MAXIMO);
}

export async function importarPedidosMagalu(conexaoId: string): Promise<ResultadoPedidos> {
  const db = obterDb();
  const [conexao] = await db.select().from(conexoesCanal).where(eq(conexoesCanal.id, conexaoId));
  if (!conexao) throw new Error("conexão não encontrada");
  const contaId = conexao.contaId;
  const loja = await lojaMagaluValida(conexaoId);
  const nome = conexao.apelido ?? conexao.usuarioExterno;

  const lista = await recentes(loja);
  if (!lista.length) return { conta: nome, novos: 0, atualizados: 0, tarefasNovas: 0 };

  const codigos = lista.map((p) => p.code);
  const existentes = new Map(
    (
      await db
        .select({ id: pedidos.id, idExterno: pedidos.idExterno, situacao: pedidos.situacao, taxaReal: pedidos.taxaRealCentavos })
        .from(pedidos)
        .where(and(eq(pedidos.canal, "magalu"), inArray(pedidos.idExterno, codigos)))
    ).map((p) => [p.idExterno!, p]),
  );

  const ids = [...new Set(lista.flatMap((p) => (p.deliveries ?? []).flatMap((e) => (e.items ?? []).map((i) => i.info?.sku ?? "")).filter(Boolean)))].map((s) =>
    idAnuncioMagalu(loja.tenant, s),
  );
  const anunciosPorSku = new Map(
    ids.length
      ? (
          await db
            .select({ id: anuncios.id, idExterno: anuncios.idExterno, pecaId: anuncios.pecaId, taxa: anuncios.taxaEstimadaCentavos })
            .from(anuncios)
            .where(and(eq(anuncios.contaId, contaId), eq(anuncios.canal, "magalu"), inArray(anuncios.idExterno, ids)))
        ).map((a) => [a.idExterno!, a])
      : [],
  );

  let novos = 0;
  let atualizados = 0;
  let tarefasNovas = 0;
  for (const p of lista) {
    const ja = existentes.get(p.code);
    // pedido que já terminou não muda mais
    if (ja && ["entregue", "cancelado", "devolvido"].includes(ja.situacao)) continue;
    const entrega = p.deliveries?.[0];
    const sit = situacao(p, entrega);
    const itens = (p.deliveries ?? []).flatMap((e) => e.items ?? []);
    const item = itens[0];
    const anuncio = item?.info?.sku ? anunciosPorSku.get(idAnuncioMagalu(loja.tenant, item.info.sku)) : undefined;
    const quantidade = itens.reduce((s, i) => s + (i.quantity ?? 0), 0);
    const valor = itens.reduce((s, i) => s + centavosMagalu(i.unit_price?.value, i.unit_price?.normalizer) * (i.quantity ?? 0), 0);
    const taxaEstimada = anuncio?.taxa != null ? anuncio.taxa * quantidade : null;
    const comissao = p.amounts?.commission;
    const taxaReal = ja?.taxaReal ?? (sit !== "aguardando_pagamento" && sit !== "cancelado" && comissao?.total != null ? centavosMagalu(comissao.total, comissao.normalizer) : null);
    const envio = entrega?.shipping;
    const nfe = entrega?.invoices?.find((n) => n.key && /^\d{44}$/.test(n.key))?.key ?? null;

    const campos = {
      situacao: sit,
      taxaRealCentavos: taxaReal,
      ...(nfe ? { chaveNfe: nfe, documentoFiscal: "nfe" as const } : {}),
      ...(sit === "enviado" && envio?.posting_date ? { enviadoEm: new Date(envio.posting_date) } : {}),
      ...(sit === "entregue" && p.updated_at ? { entregueEm: new Date(p.updated_at) } : {}),
      // só o necessário para etiqueta e tela; nada de documento, e-mail ou telefone do comprador
      dadosBrutos: {
        situacaoMagalu: entrega?.status ?? p.status,
        entrega: entrega?.id ?? null,
        logistica: envio?.provider?.name ?? "Magalu",
        prazoDespacho: envio?.handling_time?.limit_date ?? null,
        rastreio: envio?.tracking_url ?? null,
        itens: itens.map((i) => ({ sku: i.info?.sku ?? null, titulo: i.info?.name ?? null, quantidade: i.quantity ?? 0 })),
      },
    };

    let pedidoId: string;
    // mesma regra da Shopee: conta a venda uma vez quando fica paga e desfaz se uma venda contada for cancelada
    let contar = false;
    let desfazer = false;
    if (ja) {
      const pagou = sit !== "aguardando_pagamento" && sit !== "cancelado";
      const transicao = await db
        .update(pedidos)
        .set({ situacao: sit })
        .where(
          and(
            eq(pedidos.id, ja.id),
            pagou
              ? eq(pedidos.situacao, "aguardando_pagamento")
              : sit === "cancelado"
                ? sql`${pedidos.situacao} not in ('cancelado', 'aguardando_pagamento', 'devolvido')`
                : sql`false`,
          ),
        )
        .returning({ id: pedidos.id });
      contar = pagou && transicao.length > 0;
      desfazer = sit === "cancelado" && transicao.length > 0;
      await db.update(pedidos).set(campos).where(eq(pedidos.id, ja.id));
      pedidoId = ja.id;
      atualizados++;
    } else {
      const endereco = envio?.recipient?.address;
      const [novo] = await db
        .insert(pedidos)
        .values({
          contaId,
          canal: "magalu",
          conexaoId,
          idExterno: p.code,
          anuncioId: anuncio?.id ?? null,
          pecaId: anuncio?.pecaId ?? null,
          compradorNome: envio?.recipient?.name?.split(" ")[0] ?? null,
          cep: endereco?.zipcode?.replace(/\D/g, "").slice(0, 8) || null,
          uf: /^[A-Za-z]{2}$/.test(endereco?.state ?? "") ? endereco!.state!.toUpperCase() : null,
          cidade: endereco?.city ?? null,
          valorVendaCentavos: valor,
          freteCobradoCentavos: p.amounts?.freight?.total != null ? centavosMagalu(p.amounts.freight.total, p.amounts.freight.normalizer) : null,
          taxaEstimadaCentavos: taxaEstimada,
          logistica: "marketplace",
          vendidoEm: p.purchased_at ? new Date(p.purchased_at) : new Date(),
          ...campos,
        })
        .onConflictDoNothing()
        .returning({ id: pedidos.id });
      if (!novo) continue;
      pedidoId = novo.id;
      novos++;
      contar = sit !== "cancelado" && sit !== "aguardando_pagamento";
    }
    if (anuncio && contar) await registrarVenda(anuncio, quantidade, "magalu");
    if (anuncio && desfazer) await desfazerVenda(anuncio, quantidade, "magalu");

    if (ja?.taxaReal == null && taxaReal != null && taxaEstimada != null && Math.abs(taxaReal - taxaEstimada) > TOLERANCIA_TAXA) {
      await db.insert(tarefas).values({
        contaId,
        tipo: "conferir_taxa",
        titulo: `Conferir a taxa: ${item?.info?.name ?? `pedido ${p.code}`}`,
        detalhe: "A comissão real da Magalu veio diferente da estimada no anúncio.",
        pedidoId,
        pecaId: anuncio?.pecaId ?? null,
      });
      tarefasNovas++;
    }

    // pago: falta a NF-e; com a NF-e aceita, falta imprimir a etiqueta e despachar
    const tipo = sit === "pago" ? "emitir_documento_fiscal" : sit === "pronto_para_envio" ? "imprimir_etiqueta" : null;
    if (tipo) {
      const [aberta] = await db
        .select({ id: tarefas.id })
        .from(tarefas)
        .where(and(eq(tarefas.pedidoId, pedidoId), eq(tarefas.tipo, tipo), eq(tarefas.situacao, "aberta")));
      if (!aberta) {
        if (tipo === "imprimir_etiqueta") {
          await db
            .update(tarefas)
            .set({ situacao: "concluida", concluidaEm: new Date() })
            .where(and(eq(tarefas.pedidoId, pedidoId), eq(tarefas.tipo, "emitir_documento_fiscal"), eq(tarefas.situacao, "aberta")));
        }
        await db.insert(tarefas).values({
          contaId,
          tipo,
          titulo:
            tipo === "emitir_documento_fiscal"
              ? `Emitir a NF-e e enviar à Magalu: ${item?.info?.name ?? `pedido ${p.code}`}`
              : `Imprimir etiqueta e despachar: ${item?.info?.name ?? `pedido ${p.code}`}`,
          detalhe: `Magalu · ${envio?.provider?.name ?? "envio"} · pedido ${p.code}. Faça no Portal do Seller (${PORTAL_SELLER_MAGALU}).`,
          pedidoId,
          pecaId: anuncio?.pecaId ?? null,
          prazo: envio?.handling_time?.limit_date ? new Date(envio.handling_time.limit_date) : null,
        });
        tarefasNovas++;
      }
    } else if (["enviado", "entregue", "cancelado", "devolvido"].includes(sit)) {
      await db
        .update(tarefas)
        .set({ situacao: "concluida", concluidaEm: new Date() })
        .where(
          and(
            eq(tarefas.pedidoId, pedidoId),
            inArray(tarefas.tipo, ["emitir_documento_fiscal", "imprimir_etiqueta", "despachar"]),
            eq(tarefas.situacao, "aberta"),
          ),
        );
    }
  }
  return { conta: nome, novos, atualizados, tarefasNovas };
}
