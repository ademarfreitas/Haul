// Traz as vendas recentes de uma loja da Shopee para Pedidos e cria as Tarefas de cada uma.
// Docs: https://open.shopee.com/documents/v2/v2.order.get_order_list (e get_order_detail),
//       v2.payment.get_escrow_detail (taxa real), v2.logistics.* (envio e etiqueta)
// Taxa no 2º momento: comissão + taxa de serviço + taxa de transação do escrow; a estimada vem do anúncio.
import { and, eq, inArray, sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, pedidos, tarefas } from "@/db/schema";
import { chamarShopee, ErroShopee, lojaValida } from "@/lib/shopee";
import type { ResultadoPedidos } from "@/lib/ml-pedidos";

const DIAS = 60;
const JANELA_DIAS = 15; // o get_order_list aceita no máximo 15 dias por consulta
const POR_PAGINA = 100;
const POR_DETALHE = 50;
const MAXIMO = 300;
const TOLERANCIA_TAXA = 50;

type Loja = { accessToken: string; shopId: number };

type PedidoShopee = {
  order_sn: string;
  // UNPAID, READY_TO_SHIP, PROCESSED, RETRY_SHIP, SHIPPED, TO_CONFIRM_RECEIVE, COMPLETED, IN_CANCEL, CANCELLED, TO_RETURN
  order_status: string;
  create_time: number;
  update_time?: number;
  ship_by_date?: number;
  buyer_username?: string;
  shipping_carrier?: string;
  fulfillment_flag?: string; // fulfilled_by_shopee = Full da Shopee
  recipient_address?: { city?: string; state?: string; zipcode?: string };
  item_list?: { item_id: number; item_name: string; model_quantity_purchased: number; model_discounted_price?: number; model_original_price?: number }[];
};

type Escrow = { response?: { order_income?: { commission_fee?: number; service_fee?: number; seller_transaction_fee?: number; escrow_amount?: number } } };

const UF: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF",
  "espirito santo": "ES", goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
  "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI",
  "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};

// a Shopee manda o estado por extenso ("São Paulo") ou já em sigla
function uf(estado: string | undefined): string | null {
  if (!estado) return null;
  const t = estado.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return UF[t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()] ?? null;
}

function situacao(p: PedidoShopee) {
  switch (p.order_status) {
    case "UNPAID":
      return "aguardando_pagamento" as const;
    case "READY_TO_SHIP":
    case "RETRY_SHIP":
      return "pago" as const; // falta organizar o envio (coleta ou postagem)
    case "PROCESSED":
      return "pronto_para_envio" as const; // envio organizado: etiqueta liberada
    case "SHIPPED":
    case "TO_CONFIRM_RECEIVE":
      return "enviado" as const;
    case "COMPLETED":
      return "entregue" as const;
    case "TO_RETURN":
      return "devolvido" as const;
    default:
      return "cancelado" as const; // IN_CANCEL, CANCELLED
  }
}

async function snsRecentes(loja: Loja): Promise<string[]> {
  const sns: string[] = [];
  const agora = Math.floor(Date.now() / 1000);
  for (let fim = agora; fim > agora - DIAS * 86_400 && sns.length < MAXIMO; fim -= JANELA_DIAS * 86_400) {
    let cursor = "";
    do {
      const r = await chamarShopee<{ response?: { order_list?: { order_sn: string }[]; more?: boolean; next_cursor?: string } }>(
        "/api/v2/order/get_order_list",
        loja,
        { consulta: { time_range_field: "create_time", time_from: fim - JANELA_DIAS * 86_400 + 1, time_to: fim, page_size: POR_PAGINA, cursor } },
      );
      sns.push(...(r.response?.order_list ?? []).map((o) => o.order_sn));
      cursor = r.response?.more ? (r.response.next_cursor ?? "") : "";
    } while (cursor && sns.length < MAXIMO);
  }
  return [...new Set(sns)].slice(0, MAXIMO);
}

async function detalhes(sns: string[], loja: Loja): Promise<PedidoShopee[]> {
  const lista: PedidoShopee[] = [];
  for (let i = 0; i < sns.length; i += POR_DETALHE) {
    const r = await chamarShopee<{ response?: { order_list?: PedidoShopee[] } }>("/api/v2/order/get_order_detail", loja, {
      consulta: {
        order_sn_list: sns.slice(i, i + POR_DETALHE).join(","),
        response_optional_fields: "buyer_username,item_list,recipient_address,shipping_carrier,fulfillment_flag",
      },
    });
    lista.push(...(r.response?.order_list ?? []));
  }
  return lista;
}

// chamadas que só completam o pedido: se falharem, o pedido entra assim mesmo e a próxima atualização tenta de novo
async function opcional<T>(f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof ErroShopee && e.codigo === "reconectar") throw e;
    return null;
  }
}

function taxaDoEscrow(e: Escrow | null): number | null {
  const r = e?.response?.order_income;
  if (!r || (r.commission_fee == null && r.service_fee == null)) return null;
  return Math.round(((r.commission_fee ?? 0) + (r.service_fee ?? 0) + (r.seller_transaction_fee ?? 0)) * 100);
}

export async function importarPedidosShopee(conexaoId: string): Promise<ResultadoPedidos> {
  const db = obterDb();
  const [conexao] = await db.select().from(conexoesCanal).where(eq(conexoesCanal.id, conexaoId));
  if (!conexao) throw new Error("conexão não encontrada");
  const contaId = conexao.contaId;
  const loja = await lojaValida(conexaoId);
  const nome = conexao.apelido ?? conexao.usuarioExterno;

  const sns = await snsRecentes(loja);
  if (!sns.length) return { conta: nome, novos: 0, atualizados: 0, tarefasNovas: 0 };

  const existentes = new Map(
    (
      await db
        .select({ id: pedidos.id, idExterno: pedidos.idExterno, situacao: pedidos.situacao, taxaReal: pedidos.taxaRealCentavos })
        .from(pedidos)
        .where(and(eq(pedidos.canal, "shopee"), inArray(pedidos.idExterno, sns)))
    ).map((p) => [p.idExterno!, p]),
  );
  // pedido que já terminou não precisa ir à Shopee de novo
  const abertos = sns.filter((sn) => {
    const ja = existentes.get(sn);
    return !ja || !["entregue", "cancelado", "devolvido"].includes(ja.situacao);
  });
  const lista = await detalhes(abertos, loja);

  const itemIds = [...new Set(lista.flatMap((p) => (p.item_list ?? []).map((i) => String(i.item_id))))];
  const anunciosPorItem = new Map(
    itemIds.length
      ? (
          await db
            .select({ id: anuncios.id, idExterno: anuncios.idExterno, pecaId: anuncios.pecaId, taxa: anuncios.taxaEstimadaCentavos })
            .from(anuncios)
            .where(and(eq(anuncios.contaId, contaId), eq(anuncios.canal, "shopee"), inArray(anuncios.idExterno, itemIds)))
        ).map((a) => [a.idExterno!, a])
      : [],
  );

  let novos = 0;
  let atualizados = 0;
  let tarefasNovas = 0;
  for (const p of lista) {
    const ja = existentes.get(p.order_sn);
    const sit = situacao(p);
    const itens = p.item_list ?? [];
    const item = itens[0];
    const anuncio = item ? anunciosPorItem.get(String(item.item_id)) : undefined;
    const quantidade = itens.reduce((s, i) => s + i.model_quantity_purchased, 0);
    const valor = Math.round(itens.reduce((s, i) => s + (i.model_discounted_price ?? i.model_original_price ?? 0) * i.model_quantity_purchased, 0) * 100);
    const taxaEstimada = anuncio?.taxa != null ? anuncio.taxa * quantidade : null;
    const full = p.fulfillment_flag === "fulfilled_by_shopee";

    // taxa real: só depois de pago e enquanto ainda não veio
    const taxaReal =
      ja?.taxaReal ??
      (sit !== "aguardando_pagamento" && sit !== "cancelado"
        ? taxaDoEscrow(await opcional(() => chamarShopee<Escrow>("/api/v2/payment/get_escrow_detail", loja, { consulta: { order_sn: p.order_sn } })))
        : null);
    // rastreio: existe depois que o envio é organizado
    const rastreio = ["pronto_para_envio", "enviado"].includes(sit)
      ? ((await opcional(() =>
          chamarShopee<{ response?: { tracking_number?: string } }>("/api/v2/logistics/get_tracking_number", loja, { consulta: { order_sn: p.order_sn } }),
        ))?.response?.tracking_number || null)
      : null;

    const campos = {
      situacao: sit,
      taxaRealCentavos: taxaReal,
      ...(rastreio ? { codigoRastreio: rastreio } : {}),
      ...(sit === "enviado" && p.update_time ? { enviadoEm: new Date(p.update_time * 1000) } : {}),
      ...(sit === "entregue" && p.update_time ? { entregueEm: new Date(p.update_time * 1000) } : {}),
      // só o necessário para etiqueta e tela; nada de dados pessoais além do usuário e da cidade
      dadosBrutos: {
        situacaoShopee: p.order_status,
        logistica: full ? "Full" : (p.shipping_carrier ?? "Shopee"),
        prazoDespacho: p.ship_by_date ? new Date(p.ship_by_date * 1000).toISOString() : null,
        itens: itens.map((i) => ({ id: String(i.item_id), titulo: i.item_name, quantidade: i.model_quantity_purchased })),
      },
    };

    let pedidoId: string;
    if (ja) {
      await db.update(pedidos).set(campos).where(eq(pedidos.id, ja.id));
      pedidoId = ja.id;
      atualizados++;
    } else {
      const [novo] = await db
        .insert(pedidos)
        .values({
          contaId,
          canal: "shopee",
          conexaoId,
          idExterno: p.order_sn,
          anuncioId: anuncio?.id ?? null,
          pecaId: anuncio?.pecaId ?? null,
          compradorNome: p.buyer_username ?? null,
          cep: p.recipient_address?.zipcode?.replace(/\D/g, "").slice(0, 8) || null,
          uf: uf(p.recipient_address?.state),
          cidade: p.recipient_address?.city ?? null,
          valorVendaCentavos: valor,
          taxaEstimadaCentavos: taxaEstimada,
          logistica: "marketplace",
          vendidoEm: new Date(p.create_time * 1000),
          ...campos,
        })
        .onConflictDoNothing()
        .returning({ id: pedidos.id });
      if (!novo) continue;
      pedidoId = novo.id;
      novos++;
      // venda nova: baixa o estoque da peça (uma vez só, no primeiro registro do pedido)
      if (anuncio && sit !== "cancelado" && sit !== "aguardando_pagamento") {
        await db.execute(sql`
          update pecas set quantidade = greatest(quantidade - ${quantidade}, 0),
            situacao = case when quantidade - ${quantidade} <= 0 then 'vendida'::situacao_peca else situacao end
          where id = ${anuncio.pecaId}`);
        await db.execute(sql`
          update anuncios set situacao = 'vendido'
          where id = ${anuncio.id} and exists (select 1 from pecas where id = ${anuncio.pecaId} and situacao = 'vendida')`);
      }
    }

    if (ja?.taxaReal == null && taxaReal != null && taxaEstimada != null && Math.abs(taxaReal - taxaEstimada) > TOLERANCIA_TAXA) {
      await db.insert(tarefas).values({
        contaId,
        tipo: "conferir_taxa",
        titulo: `Conferir a taxa: ${item?.item_name ?? `pedido ${p.order_sn}`}`,
        detalhe: "A taxa real da Shopee veio diferente da estimada no anúncio.",
        pedidoId,
        pecaId: anuncio?.pecaId ?? null,
      });
      tarefasNovas++;
    }

    // etiqueta: tarefa aberta enquanto falta despachar (no Full é a Shopee quem despacha)
    if ((sit === "pago" || sit === "pronto_para_envio") && !full) {
      const [aberta] = await db
        .select({ id: tarefas.id })
        .from(tarefas)
        .where(and(eq(tarefas.pedidoId, pedidoId), eq(tarefas.tipo, "imprimir_etiqueta"), eq(tarefas.situacao, "aberta")));
      if (!aberta) {
        await db.insert(tarefas).values({
          contaId,
          tipo: "imprimir_etiqueta",
          titulo: `Imprimir etiqueta e despachar: ${item?.item_name ?? `pedido ${p.order_sn}`}`,
          detalhe: `Shopee · ${p.shipping_carrier ?? "envio"} · pedido ${p.order_sn}`,
          pedidoId,
          pecaId: anuncio?.pecaId ?? null,
          prazo: p.ship_by_date ? new Date(p.ship_by_date * 1000) : null,
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
