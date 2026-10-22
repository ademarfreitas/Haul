// Traz as vendas recentes de uma conta do Mercado Livre para Pedidos e cria as Tarefas de cada uma.
// Docs: https://developers.mercadolivre.com.br/pt-br/gestao-de-vendas (orders/search)
//       https://developers.mercadolivre.com.br/pt-br/gerenciamento-de-envios (shipments, etiquetas)
// Taxa no 2º momento: sale_fee do pedido é a taxa real; a estimada vem do anúncio.
import { and, eq, inArray, sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, pedidos, tarefas } from "@/db/schema";
import { chamarApi, ErroMl, tokenValido } from "@/lib/mercado-livre";

const DIAS = 60;
const POR_PAGINA = 50;
const MAXIMO = 200;
// diferença de taxa que vira tarefa "conferir taxa" (centavos)
const TOLERANCIA_TAXA = 50;

type PedidoMl = {
  id: number;
  status: string; // paid, cancelled, confirmed, payment_required, payment_in_process...
  date_created: string;
  total_amount: number;
  order_items: { item: { id: string; title: string }; quantity: number; unit_price: number; sale_fee?: number }[];
  buyer?: { nickname?: string };
  shipping?: { id?: number | null };
  pack_id?: number | null;
};

// formato novo (x-format-new) e o antigo: lê os dois
type EnvioMl = {
  id: number;
  status: string; // pending, handling, ready_to_ship, shipped, delivered, not_delivered, cancelled
  substatus?: string | null;
  tracking_number?: string | null;
  logistic_type?: string;
  logistic?: { type?: string; mode?: string };
  receiver_address?: { zip_code?: string; city?: { name?: string }; state?: { id?: string } };
  destination?: { shipping_address?: { zip_code?: string; city?: { name?: string }; state?: { id?: string } } };
  lead_time?: { estimated_handling_limit?: { date?: string } };
  status_history?: { date_shipped?: string | null; date_delivered?: string | null };
};

export type ResultadoPedidos = { conta: string; novos: number; atualizados: number; tarefasNovas: number };

const LOGISTICA: Record<string, string> = {
  fulfillment: "Full",
  cross_docking: "Coleta",
  xd_drop_off: "Agência",
  drop_off: "Correios/Agência",
  self_service: "Flex",
};

function situacao(p: PedidoMl, e: EnvioMl | null) {
  if (p.status === "cancelled" || e?.status === "cancelled") return "cancelado" as const;
  if (e?.status === "delivered") return "entregue" as const;
  if (e?.status === "shipped" || e?.status === "not_delivered") return "enviado" as const;
  if (e?.status === "ready_to_ship") return "pronto_para_envio" as const;
  if (p.status === "paid" || p.status === "confirmed") return "pago" as const;
  return "aguardando_pagamento" as const;
}

async function envio(id: number | null | undefined, token: string): Promise<EnvioMl | null> {
  if (!id) return null;
  try {
    return await chamarApi<EnvioMl>(`/shipments/${id}`, token, { cabecalhos: { "x-format-new": "true" } });
  } catch (e) {
    if (e instanceof ErroMl && e.codigo === "reconectar") throw e;
    return null; // sem o envio o pedido entra assim mesmo; a próxima atualização tenta de novo
  }
}

export async function importarPedidos(conexaoId: string): Promise<ResultadoPedidos> {
  const db = obterDb();
  const [conexao] = await db.select().from(conexoesCanal).where(eq(conexoesCanal.id, conexaoId));
  if (!conexao) throw new Error("conexão não encontrada");
  const contaId = conexao.contaId;
  const token = await tokenValido(conexaoId);

  const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString();
  const lista: PedidoMl[] = [];
  for (let offset = 0; offset < MAXIMO; offset += POR_PAGINA) {
    const r = await chamarApi<{ results: PedidoMl[]; paging: { total: number } }>(
      `/orders/search?seller=${conexao.usuarioExterno}&sort=date_desc&limit=${POR_PAGINA}&offset=${offset}&order.date_created.from=${encodeURIComponent(desde)}`,
      token,
    );
    lista.push(...r.results);
    if (r.results.length < POR_PAGINA || lista.length >= r.paging.total) break;
  }
  const nome = conexao.apelido ?? conexao.usuarioExterno;
  if (!lista.length) return { conta: nome, novos: 0, atualizados: 0, tarefasNovas: 0 };

  const ids = lista.map((p) => String(p.id));
  const existentes = new Map(
    (
      await db
        .select({ id: pedidos.id, idExterno: pedidos.idExterno, situacao: pedidos.situacao })
        .from(pedidos)
        .where(and(eq(pedidos.canal, "mercado_livre"), inArray(pedidos.idExterno, ids)))
    ).map((p) => [p.idExterno!, p]),
  );
  const itemIds = [...new Set(lista.flatMap((p) => p.order_items.map((i) => i.item.id)))];
  const anunciosPorItem = new Map(
    (
      await db
        .select({ id: anuncios.id, idExterno: anuncios.idExterno, pecaId: anuncios.pecaId, taxa: anuncios.taxaEstimadaCentavos })
        .from(anuncios)
        .where(and(eq(anuncios.contaId, contaId), eq(anuncios.canal, "mercado_livre"), inArray(anuncios.idExterno, itemIds)))
    ).map((a) => [a.idExterno!, a]),
  );

  let novos = 0;
  let atualizados = 0;
  let tarefasNovas = 0;
  for (const p of lista) {
    const ja = existentes.get(String(p.id));
    // pedido que já terminou não precisa ir ao ML de novo
    if (ja && ["entregue", "cancelado", "devolvido"].includes(ja.situacao)) continue;

    const e = await envio(p.shipping?.id, token);
    const sit = situacao(p, e);
    const item = p.order_items[0];
    const anuncio = item ? anunciosPorItem.get(item.item.id) : undefined;
    const quantidade = p.order_items.reduce((s, i) => s + i.quantity, 0);
    const valor = Math.round(p.order_items.reduce((s, i) => s + i.unit_price * i.quantity, 0) * 100);
    const taxaReal = p.order_items.some((i) => i.sale_fee != null)
      ? Math.round(p.order_items.reduce((s, i) => s + (i.sale_fee ?? 0) * i.quantity, 0) * 100)
      : null;
    const taxaEstimada = anuncio?.taxa != null ? anuncio.taxa * quantidade : null;
    const endereco = e?.destination?.shipping_address ?? e?.receiver_address;
    const tipoLogistica = e?.logistic?.type ?? e?.logistic_type ?? "";
    const campos = {
      situacao: sit,
      codigoRastreio: e?.tracking_number ?? null,
      taxaRealCentavos: taxaReal,
      enviadoEm: e?.status_history?.date_shipped ? new Date(e.status_history.date_shipped) : null,
      entregueEm: e?.status_history?.date_delivered ? new Date(e.status_history.date_delivered) : null,
      // só o necessário para etiqueta e tela; nada de dados pessoais além do apelido e da cidade
      dadosBrutos: {
        envioId: e?.id ?? p.shipping?.id ?? null,
        logistica: LOGISTICA[tipoLogistica] ?? tipoLogistica,
        subsituacao: e?.substatus ?? null,
        prazoDespacho: e?.lead_time?.estimated_handling_limit?.date ?? null,
        pacote: p.pack_id ?? null,
        itens: p.order_items.map((i) => ({ id: i.item.id, titulo: i.item.title, quantidade: i.quantity })),
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
          canal: "mercado_livre",
          conexaoId,
          idExterno: String(p.id),
          anuncioId: anuncio?.id ?? null,
          pecaId: anuncio?.pecaId ?? null,
          compradorNome: p.buyer?.nickname ?? null,
          cep: endereco?.zip_code?.replace(/\D/g, "").slice(0, 8) || null,
          uf: endereco?.state?.id?.replace(/^BR-/, "").slice(0, 2) || null,
          cidade: endereco?.city?.name ?? null,
          valorVendaCentavos: valor,
          taxaEstimadaCentavos: taxaEstimada,
          logistica: "marketplace",
          vendidoEm: new Date(p.date_created),
          ...campos,
        })
        .onConflictDoNothing()
        .returning({ id: pedidos.id });
      if (!novo) continue;
      pedidoId = novo.id;
      novos++;
      // venda nova: baixa o estoque da peça (uma vez só, no primeiro registro do pedido)
      if (anuncio && sit !== "cancelado") {
        await db.execute(sql`
          update pecas set quantidade = greatest(quantidade - ${quantidade}, 0),
            situacao = case when quantidade - ${quantidade} <= 0 then 'vendida'::situacao_peca else situacao end
          where id = ${anuncio.pecaId}`);
        await db.execute(sql`
          update anuncios set situacao = 'vendido'
          where id = ${anuncio.id} and exists (select 1 from pecas where id = ${anuncio.pecaId} and situacao = 'vendida')`);
      }
      if (taxaReal != null && taxaEstimada != null && Math.abs(taxaReal - taxaEstimada) > TOLERANCIA_TAXA) {
        await db.insert(tarefas).values({
          contaId,
          tipo: "conferir_taxa",
          titulo: `Conferir a taxa: ${item?.item.title ?? `pedido ${p.id}`}`,
          detalhe: `A taxa real do Mercado Livre veio diferente da estimada no anúncio.`,
          pedidoId,
          pecaId: anuncio?.pecaId ?? null,
        });
        tarefasNovas++;
      }
    }

    // etiqueta: tarefa aberta enquanto está pronto para envio (o Full é o ML quem despacha)
    if (sit === "pronto_para_envio" && tipoLogistica !== "fulfillment") {
      const [aberta] = await db
        .select({ id: tarefas.id })
        .from(tarefas)
        .where(and(eq(tarefas.pedidoId, pedidoId), eq(tarefas.tipo, "imprimir_etiqueta"), eq(tarefas.situacao, "aberta")));
      if (!aberta) {
        const prazo = e?.lead_time?.estimated_handling_limit?.date;
        await db.insert(tarefas).values({
          contaId,
          tipo: "imprimir_etiqueta",
          titulo: `Imprimir etiqueta e despachar: ${item?.item.title ?? `pedido ${p.id}`}`,
          detalhe: `Mercado Livre · ${LOGISTICA[tipoLogistica] ?? "envio"} · pedido ${p.id}`,
          pedidoId,
          pecaId: anuncio?.pecaId ?? null,
          prazo: prazo ? new Date(prazo) : null,
        });
        tarefasNovas++;
      }
    } else if (["enviado", "entregue", "cancelado"].includes(sit)) {
      await db
        .update(tarefas)
        .set({ situacao: "concluida", concluidaEm: new Date() })
        .where(and(eq(tarefas.pedidoId, pedidoId), inArray(tarefas.tipo, ["imprimir_etiqueta", "despachar"]), eq(tarefas.situacao, "aberta")));
    }
  }
  return { conta: nome, novos, atualizados, tarefasNovas };
}
