// Traz as vendas recentes de uma conta da Amazon.com.br para Pedidos e cria as Tarefas de cada uma.
// Docs: https://developer-docs.amazon.com/sp-api/reference/orders-v2026-01-01 (searchOrders, já com os itens)
//       e Finances v0 listFinancialEventsByOrderId (taxa real, que sai quando o pedido é enviado).
// A Amazon limita muito as chamadas (searchOrders: rajada de 20 páginas, depois 1 a cada 3 min; finanças:
// 1 a cada 2 s), então a taxa real é buscada aos poucos, no máximo TAXAS_POR_VEZ por atualização.
import { and, eq, inArray, sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, pedidos, tarefas } from "@/db/schema";
import { desfazerVenda, registrarVenda } from "@/lib/multivenda";
import { chamarAmazon, contaAmazonValida, ErroAmazon, MARKETPLACE_BR } from "@/lib/amazon";
import { idAnuncioAmazon } from "@/lib/amazon-importar";
import type { ResultadoPedidos } from "@/lib/ml-pedidos";

const DIAS = 60;
const POR_PAGINA = 100;
const PAGINAS = 15; // fica dentro da rajada do searchOrders
const TAXAS_POR_VEZ = 25;
const TOLERANCIA_TAXA = 50;

type Dinheiro = { amount?: string; currencyCode?: string };

type PedidoAmazon = {
  orderId: string;
  createdTime: string;
  lastUpdatedTime?: string;
  programs?: string[]; // DELIVERY_BY_AMAZON = DBA (a Amazon coleta e entrega)
  recipient?: { deliveryAddress?: { city?: string; stateOrRegion?: string; postalCode?: string } };
  fulfillment?: {
    // PENDING_AVAILABILITY, PENDING, UNSHIPPED, PARTIALLY_SHIPPED, SHIPPED, CANCELLED, UNFULFILLABLE
    fulfillmentStatus?: string;
    fulfilledBy?: "AMAZON" | "MERCHANT";
    shipByWindow?: { latestDateTime?: string };
  };
  orderItems?: {
    orderItemId: string;
    quantityOrdered: number;
    product?: { sellerSku?: string; title?: string; price?: { unitPrice?: Dinheiro } };
    proceeds?: { breakdowns?: { type: string; subtotal?: Dinheiro }[] };
  }[];
  packages?: { trackingNumber?: string; carrier?: string; shipTime?: string; packageStatus?: { status?: string } }[];
};

type Busca = { orders?: PedidoAmazon[]; pagination?: { nextToken?: string } };

type Financeiro = {
  payload?: {
    FinancialEvents?: {
      ShipmentEventList?: { ShipmentItemList?: { ItemFeeList?: { FeeAmount?: { CurrencyAmount?: number } }[] }[] }[];
    };
  };
};

const centavos = (d: Dinheiro | undefined) => Math.round(Number(d?.amount ?? 0) * 100) || 0;

function situacao(p: PedidoAmazon) {
  switch (p.fulfillment?.fulfillmentStatus) {
    case "PENDING":
    case "PENDING_AVAILABILITY":
      return "aguardando_pagamento" as const;
    case "UNSHIPPED":
    case "PARTIALLY_SHIPPED":
      return "pago" as const;
    case "SHIPPED":
      return p.packages?.length && p.packages.every((x) => x.packageStatus?.status === "DELIVERED") ? ("entregue" as const) : ("enviado" as const);
    default:
      return "cancelado" as const; // CANCELLED, UNFULFILLABLE
  }
}

function logistica(p: PedidoAmazon): { nome: string; propria: boolean } {
  if (p.fulfillment?.fulfilledBy === "AMAZON") return { nome: "FBA", propria: false };
  if (p.programs?.includes("DELIVERY_BY_AMAZON")) return { nome: "DBA", propria: false };
  return { nome: "Envio próprio", propria: true };
}

async function pedidosRecentes(token: string): Promise<PedidoAmazon[]> {
  const lista: PedidoAmazon[] = [];
  const createdAfter = new Date(Date.now() - DIAS * 86_400_000).toISOString();
  // RECIPIENT traz só cidade, UF e CEP sem o papel de dados pessoais; se a conta não puder, vai sem ele
  let incluir = "FULFILLMENT,PROCEEDS,PACKAGES,RECIPIENT";
  let paginationToken: string | undefined;
  for (let pagina = 0; pagina < PAGINAS; pagina++) {
    let r: Busca;
    try {
      r = await chamarAmazon<Busca>("/orders/2026-01-01/orders", token, {
        consulta: { marketplaceIds: MARKETPLACE_BR, createdAfter, maxResultsPerPage: POR_PAGINA, includedData: incluir, paginationToken },
      });
    } catch (e) {
      if (!(e instanceof ErroAmazon) || ![400, 403].includes(e.status) || !incluir.includes("RECIPIENT") || paginationToken) throw e;
      incluir = "FULFILLMENT,PROCEEDS,PACKAGES";
      pagina--;
      continue;
    }
    lista.push(...(r.orders ?? []));
    paginationToken = r.pagination?.nextToken;
    if (!paginationToken) break;
  }
  return lista;
}

async function taxaReal(token: string, orderId: string): Promise<number | null> {
  const r = await chamarAmazon<Financeiro>(`/finances/v0/orders/${encodeURIComponent(orderId)}/financialEvents`, token);
  const taxas = (r.payload?.FinancialEvents?.ShipmentEventList ?? [])
    .flatMap((e) => e.ShipmentItemList ?? [])
    .flatMap((i) => i.ItemFeeList ?? [])
    .map((f) => f.FeeAmount?.CurrencyAmount ?? 0);
  if (!taxas.length) return null;
  // as taxas vêm negativas (saem do vendedor)
  return Math.round(-taxas.reduce((s, x) => s + x, 0) * 100);
}

export async function importarPedidosAmazon(conexaoId: string): Promise<ResultadoPedidos> {
  const db = obterDb();
  const [conexao] = await db.select().from(conexoesCanal).where(eq(conexoesCanal.id, conexaoId));
  if (!conexao) throw new Error("conexão não encontrada");
  const contaId = conexao.contaId;
  const { token, vendedorId } = await contaAmazonValida(conexaoId);
  const nome = conexao.apelido ?? vendedorId;

  const lista = await pedidosRecentes(token);
  if (!lista.length) return { conta: nome, novos: 0, atualizados: 0, tarefasNovas: 0 };

  const ids = lista.map((p) => p.orderId);
  const existentes = new Map(
    (
      await db
        .select({ id: pedidos.id, idExterno: pedidos.idExterno, situacao: pedidos.situacao, taxaReal: pedidos.taxaRealCentavos })
        .from(pedidos)
        .where(and(eq(pedidos.canal, "amazon"), inArray(pedidos.idExterno, ids)))
    ).map((p) => [p.idExterno!, p]),
  );

  const idsAnuncio = [...new Set(lista.flatMap((p) => (p.orderItems ?? []).map((i) => i.product?.sellerSku).filter((s): s is string => !!s).map((s) => idAnuncioAmazon(vendedorId, s))))];
  const anunciosPorId = new Map(
    idsAnuncio.length
      ? (
          await db
            .select({ id: anuncios.id, idExterno: anuncios.idExterno, pecaId: anuncios.pecaId, taxa: anuncios.taxaEstimadaCentavos })
            .from(anuncios)
            .where(and(eq(anuncios.contaId, contaId), eq(anuncios.canal, "amazon"), inArray(anuncios.idExterno, idsAnuncio)))
        ).map((a) => [a.idExterno!, a])
      : [],
  );

  let novos = 0;
  let atualizados = 0;
  let tarefasNovas = 0;
  let taxasBuscadas = 0;
  for (const p of lista) {
    const ja = existentes.get(p.orderId);
    const sit = situacao(p);
    if (ja && ["entregue", "cancelado", "devolvido"].includes(ja.situacao) && ja.situacao === sit && ja.taxaReal != null) continue;
    const itens = p.orderItems ?? [];
    const item = itens[0];
    const sku = item?.product?.sellerSku;
    const anuncio = sku ? anunciosPorId.get(idAnuncioAmazon(vendedorId, sku)) : undefined;
    const quantidade = itens.reduce((s, i) => s + i.quantityOrdered, 0);
    const valor = itens.reduce((s, i) => {
      const doItem = i.proceeds?.breakdowns?.find((b) => b.type === "ITEM")?.subtotal;
      return s + (doItem ? centavos(doItem) : centavos(i.product?.price?.unitPrice) * i.quantityOrdered);
    }, 0);
    const taxaEstimada = anuncio?.taxa != null ? anuncio.taxa * quantidade : null;
    const log = logistica(p);
    const pacote = p.packages?.find((x) => x.trackingNumber);

    // taxa real: a Amazon lança as taxas quando o pedido é enviado
    let taxa = ja?.taxaReal ?? null;
    if (taxa == null && (sit === "enviado" || sit === "entregue") && taxasBuscadas < TAXAS_POR_VEZ) {
      taxasBuscadas++;
      try {
        taxa = await taxaReal(token, p.orderId);
      } catch (e) {
        if (e instanceof ErroAmazon && e.codigo === "reconectar") throw e;
      }
    }

    const campos = {
      situacao: sit,
      taxaRealCentavos: taxa,
      ...(pacote?.trackingNumber ? { codigoRastreio: pacote.trackingNumber } : {}),
      ...(sit === "enviado" && pacote?.shipTime ? { enviadoEm: new Date(pacote.shipTime) } : {}),
      ...(sit === "entregue" && p.lastUpdatedTime ? { entregueEm: new Date(p.lastUpdatedTime) } : {}),
      // só o necessário para etiqueta e tela; nada de dados pessoais além da cidade
      dadosBrutos: {
        situacaoAmazon: p.fulfillment?.fulfillmentStatus ?? null,
        logistica: log.nome,
        prazoDespacho: p.fulfillment?.shipByWindow?.latestDateTime ?? null,
        itens: itens.map((i) => ({ id: i.orderItemId, sku: i.product?.sellerSku ?? null, titulo: i.product?.title ?? null, quantidade: i.quantityOrdered })),
      },
    };

    let pedidoId: string;
    // conta como venda (baixa estoque) quando entra já confirmado ou quando sai de "aguardando pagamento";
    // desfaz quando uma venda contada é cancelada. Trocas de situação atômicas, como no ML e na Shopee.
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
      const end = p.recipient?.deliveryAddress;
      const uf = end?.stateOrRegion?.trim().toUpperCase();
      const [novo] = await db
        .insert(pedidos)
        .values({
          contaId,
          canal: "amazon",
          conexaoId,
          idExterno: p.orderId,
          anuncioId: anuncio?.id ?? null,
          pecaId: anuncio?.pecaId ?? null,
          cep: end?.postalCode?.replace(/\D/g, "").slice(0, 8) || null,
          uf: uf && /^[A-Z]{2}$/.test(uf) ? uf : null,
          cidade: end?.city ?? null,
          valorVendaCentavos: valor,
          taxaEstimadaCentavos: taxaEstimada,
          logistica: log.propria ? "propria" : "marketplace",
          vendidoEm: new Date(p.createdTime),
          ...campos,
        })
        .onConflictDoNothing()
        .returning({ id: pedidos.id });
      if (!novo) continue;
      pedidoId = novo.id;
      novos++;
      contar = sit !== "cancelado" && sit !== "aguardando_pagamento";
    }
    // FBA: a peça está no centro da Amazon; a venda baixa o estoque do mesmo jeito e tira dos outros canais
    if (anuncio && contar) await registrarVenda(anuncio, quantidade, "amazon");
    if (anuncio && desfazer) await desfazerVenda(anuncio, quantidade, "amazon");

    if (ja?.taxaReal == null && taxa != null && taxaEstimada != null && Math.abs(taxa - taxaEstimada) > TOLERANCIA_TAXA) {
      await db.insert(tarefas).values({
        contaId,
        tipo: "conferir_taxa",
        titulo: `Conferir a taxa: ${item?.product?.title ?? `pedido ${p.orderId}`}`,
        detalhe: "A taxa real da Amazon veio diferente da estimada no anúncio.",
        pedidoId,
        pecaId: anuncio?.pecaId ?? null,
      });
      tarefasNovas++;
    }

    // etiqueta: tarefa aberta enquanto falta despachar (no FBA é a Amazon quem despacha)
    if (sit === "pago" && log.nome !== "FBA") {
      const [aberta] = await db
        .select({ id: tarefas.id })
        .from(tarefas)
        .where(and(eq(tarefas.pedidoId, pedidoId), eq(tarefas.tipo, "imprimir_etiqueta"), eq(tarefas.situacao, "aberta")));
      if (!aberta) {
        await db.insert(tarefas).values({
          contaId,
          tipo: "imprimir_etiqueta",
          titulo: `Imprimir etiqueta e despachar: ${item?.product?.title ?? `pedido ${p.orderId}`}`,
          detalhe: `Amazon · ${log.nome} · pedido ${p.orderId}`,
          pedidoId,
          pecaId: anuncio?.pecaId ?? null,
          prazo: p.fulfillment?.shipByWindow?.latestDateTime ? new Date(p.fulfillment.shipByWindow.latestDateTime) : null,
        });
        tarefasNovas++;
      }
    } else if (["enviado", "entregue", "cancelado", "devolvido"].includes(sit)) {
      await db
        .update(tarefas)
        .set({ situacao: "concluida", concluidaEm: new Date() })
        .where(and(eq(tarefas.pedidoId, pedidoId), inArray(tarefas.tipo, ["imprimir_etiqueta", "despachar"]), eq(tarefas.situacao, "aberta")));
    }
  }
  return { conta: nome, novos, atualizados, tarefasNovas };
}
