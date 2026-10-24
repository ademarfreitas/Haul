// Processa os avisos de venda guardados em eventos_canal: um aviso de pedido faz o Plist buscar as
// vendas daquela conta na hora (e, com elas, tirar a peça dos outros canais), sem esperar o lojista
// clicar em "Atualizar pedidos". Roda depois da resposta ao canal (after), para o aviso não demorar.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { eventosCanal } from "@/db/schema";
import { importarPedidos } from "@/lib/ml-pedidos";
import { importarPedidosShopee } from "@/lib/shopee-pedidos";
import { importarPedidosAmazon } from "@/lib/amazon-pedidos";
import { importarPedidosMagalu } from "@/lib/magalu-pedidos";

// tópicos que viram busca de pedidos: orders_v2 no ML; na Shopee, push 3 (status do pedido) e 4 (rastreio);
// na Amazon, ORDER_CHANGE (vem pela fila SQS); na Magalu, qualquer aviso de pedido ou entrega (a rota grava como "pedido")
export const TOPICOS_PEDIDO = { mercado_livre: ["orders_v2"], shopee: ["push_3", "push_4"], amazon: ["ORDER_CHANGE"], magalu: ["pedido"] } as const;
const IMPORTAR = { mercado_livre: importarPedidos, shopee: importarPedidosShopee, amazon: importarPedidosAmazon, magalu: importarPedidosMagalu } as const;
type CanalComPedidos = keyof typeof TOPICOS_PEDIDO;

export async function processarAvisosDePedido(conexaoId: string, canal: CanalComPedidos): Promise<void> {
  const db = obterDb();
  // pega os avisos pendentes de uma vez: outra execução ao mesmo tempo não pega os mesmos
  const pegos = await db
    .update(eventosCanal)
    .set({ processadoEm: new Date() })
    .where(and(eq(eventosCanal.conexaoId, conexaoId), isNull(eventosCanal.processadoEm), inArray(eventosCanal.topico, [...TOPICOS_PEDIDO[canal]])))
    .returning({ id: eventosCanal.id });
  if (!pegos.length) return;

  try {
    await IMPORTAR[canal](conexaoId);
  } catch (e) {
    // devolve para a fila: o próximo aviso (ou o botão Atualizar pedidos) tenta de novo
    const motivo = e instanceof Error ? e.message.slice(0, 300) : "falhou";
    console.error(`avisos ${canal} falharam:`, motivo);
    await db
      .update(eventosCanal)
      .set({ processadoEm: null, tentativas: sql`${eventosCanal.tentativas} + 1`, ultimoErro: motivo })
      .where(inArray(eventosCanal.id, pegos.map((p) => p.id)));
  }
}
