// Traz as vendas recentes de uma loja da Shein para Pedidos e cria as Tarefas de cada uma.
// Fluxo da Shein no Brasil: pedido chega pago → o lojista emite a NF-e e manda para a Shein → imprime a
// etiqueta oficial (print-express-info) → posta ou espera a coleta.
// Taxa no 2º momento: comissão + taxa de serviço do detalhe do pedido; a estimada vem do anúncio.
// Na Shein cada unidade é uma linha em orderGoodsInfoList: a quantidade é o número de linhas.
import { and, eq, inArray, sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, pecas, pedidos, tarefas } from "@/db/schema";
import type { ResultadoPedidos } from "@/lib/ml-pedidos";
import { desfazerVenda, registrarVenda } from "@/lib/multivenda";
import { CAMINHOS_SHEIN, centavosShein, chamarShein, comChaves, horaShein, type ChavesShein } from "@/lib/shein";

const DIAS = 30; // a lista aceita no máximo 48 h por consulta: 30 dias já são 15 consultas
const JANELA_MS = 48 * 3_600_000;
const POR_PAGINA = 30; // máximo do order-list
const POR_DETALHE = 30; // máximo do order-detail
const MAXIMO = 300;
const TOLERANCIA_TAXA = 50;

type ItemShein = { skuCode?: string; sellerSku?: string; goodsTitle?: string; sellerCurrencyPrice?: number | string; goodsPrice?: number | string };
type Pacote = { packageNo?: string; waybillNo?: string };
export type PedidoShein = {
  orderNo: string;
  orderStatus?: number | string; // 1 a processar, 2 a enviar, 3 a Shein envia, 4 enviado, 5 entregue, 6 reembolsado, 7 aguardando coleta, 8 extraviado, 9 recusado
  orderTime?: string;
  createTime?: string;
  orderCreateTime?: string;
  productTotalPrice?: number | string;
  totalCommission?: number | string;
  totalServiceCharge?: number | string;
  nfeInvoiceStatus?: number | string; // 1 NF-e enviada, 2 falta, 3 reenviar, 4 não precisa
  orderGoodsInfoList?: ItemShein[];
  packageWaybillList?: Pacote[];
  receiveMsg?: { postCode?: string; province?: string; provinceName?: string; provinceCode?: string; city?: string; cityName?: string };
};

// A Shein embrulha listas com nomes diferentes de uma API para outra: pega a primeira lista que achar.
export function primeiraLista<T>(info: unknown): T[] {
  if (Array.isArray(info)) return info as T[];
  if (!info || typeof info !== "object") return [];
  const o = info as Record<string, unknown>;
  for (const k of ["orderList", "list", "data", "records", "rows"]) if (Array.isArray(o[k])) return o[k] as T[];
  for (const v of Object.values(o)) {
    const achada = primeiraLista<T>(v);
    if (achada.length) return achada;
  }
  return [];
}

function situacao(p: PedidoShein) {
  switch (String(p.orderStatus)) {
    case "1":
      return "pago" as const; // falta NF-e e etiqueta
    case "2":
    case "7":
      return "pronto_para_envio" as const;
    case "3":
    case "4":
      return "enviado" as const;
    case "5":
      return "entregue" as const;
    case "9":
      return "devolvido" as const;
    default:
      return "cancelado" as const; // 6 reembolsado, 8 extraviado
  }
}

// "yyyy-MM-dd HH:mm:ss" no horário de Pequim (UTC+8)
function data(texto: string | undefined): Date | null {
  if (!texto) return null;
  const d = new Date(`${texto.trim().replace(" ", "T")}+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function numerosRecentes(chaves: ChavesShein): Promise<string[]> {
  const numeros: string[] = [];
  const agora = Date.now();
  for (let fim = agora; fim > agora - DIAS * 86_400_000 && numeros.length < MAXIMO; fim -= JANELA_MS) {
    for (let pagina = 1; numeros.length < MAXIMO; pagina++) {
      const info = await chamarShein<unknown>(CAMINHOS_SHEIN.pedidos, chaves, {
        json: { queryType: 1, startTime: horaShein(new Date(fim - JANELA_MS + 1000)), endTime: horaShein(new Date(fim)), page: pagina, pageSize: POR_PAGINA },
      });
      const lista = primeiraLista<{ orderNo?: string }>(info);
      numeros.push(...lista.map((o) => o.orderNo).filter((n): n is string => !!n));
      if (lista.length < POR_PAGINA) break;
    }
  }
  return [...new Set(numeros)].slice(0, MAXIMO);
}

export async function detalhesShein(numeros: string[], chaves: ChavesShein): Promise<PedidoShein[]> {
  const lista: PedidoShein[] = [];
  for (let i = 0; i < numeros.length; i += POR_DETALHE) {
    const info = await chamarShein<unknown>(CAMINHOS_SHEIN.pedido, chaves, { json: { orderNoList: numeros.slice(i, i + POR_DETALHE) } });
    lista.push(...primeiraLista<PedidoShein>(info).filter((p) => p?.orderNo));
  }
  return lista;
}

function taxaReal(p: PedidoShein): number | null {
  if (p.totalCommission == null && p.totalServiceCharge == null) return null;
  return centavosShein(p.totalCommission) + centavosShein(p.totalServiceCharge);
}

export async function importarPedidosShein(conexaoId: string): Promise<ResultadoPedidos> {
  const db = obterDb();
  const [conexao] = await db.select().from(conexoesCanal).where(eq(conexoesCanal.id, conexaoId));
  if (!conexao) throw new Error("conexão não encontrada");
  const contaId = conexao.contaId;
  const nome = conexao.apelido ?? "Shein";

  const { numeros, lista: listaBruta } = await comChaves(conexaoId, async (chaves) => {
    const numeros = await numerosRecentes(chaves);
    if (!numeros.length) return { numeros, lista: [] as PedidoShein[] };
    const terminados = new Set(
      (
        await db
          .select({ idExterno: pedidos.idExterno })
          .from(pedidos)
          .where(and(eq(pedidos.canal, "shein"), inArray(pedidos.idExterno, numeros), inArray(pedidos.situacao, ["entregue", "cancelado", "devolvido"])))
      ).map((p) => p.idExterno),
    );
    // pedido que já terminou não precisa ir à Shein de novo
    return { numeros, lista: await detalhesShein(numeros.filter((n) => !terminados.has(n)), chaves) };
  });
  if (!numeros.length) return { conta: nome, novos: 0, atualizados: 0, tarefasNovas: 0 };
  const lista = listaBruta;

  const existentes = new Map(
    (
      await db
        .select({ id: pedidos.id, idExterno: pedidos.idExterno, situacao: pedidos.situacao, taxaReal: pedidos.taxaRealCentavos })
        .from(pedidos)
        .where(and(eq(pedidos.canal, "shein"), inArray(pedidos.idExterno, lista.map((p) => p.orderNo))))
    ).map((p) => [p.idExterno!, p]),
  );

  // o SKU do vendedor liga a venda à peça e ao anúncio da Shein dela
  const skus = [...new Set(lista.flatMap((p) => (p.orderGoodsInfoList ?? []).map((i) => i.sellerSku?.trim()).filter((s): s is string => !!s)))];
  const anuncioPorSku = new Map(
    skus.length
      ? (
          await db
            .select({ sku: pecas.sku, id: anuncios.id, pecaId: anuncios.pecaId, taxa: anuncios.taxaEstimadaCentavos })
            .from(anuncios)
            .innerJoin(pecas, eq(pecas.id, anuncios.pecaId))
            .where(and(eq(anuncios.contaId, contaId), eq(anuncios.canal, "shein"), inArray(pecas.sku, skus)))
        ).map((a) => [a.sku.toLowerCase(), a])
      : [],
  );

  let novos = 0;
  let atualizados = 0;
  let tarefasNovas = 0;
  for (const p of lista) {
    const ja = existentes.get(p.orderNo);
    const sit = situacao(p);
    const itens = p.orderGoodsInfoList ?? [];
    const item = itens[0];
    const anuncio = item?.sellerSku ? anuncioPorSku.get(item.sellerSku.trim().toLowerCase()) : undefined;
    const quantidade = Math.max(1, itens.filter((i) => !item?.sellerSku || i.sellerSku === item.sellerSku).length);
    const valor = centavosShein(p.productTotalPrice) || itens.reduce((s, i) => s + (centavosShein(i.sellerCurrencyPrice) || centavosShein(i.goodsPrice)), 0);
    const taxaEstimada = anuncio?.taxa != null ? anuncio.taxa * quantidade : null;
    const taxa = ja?.taxaReal ?? (sit !== "cancelado" ? taxaReal(p) : null);
    const rastreio = (p.packageWaybillList ?? []).map((x) => x.waybillNo).find(Boolean) ?? null;
    const titulo = item?.goodsTitle || `pedido ${p.orderNo}`;
    const faltaNfe = String(p.nfeInvoiceStatus) === "2" || String(p.nfeInvoiceStatus) === "3";

    const campos = {
      situacao: sit,
      taxaRealCentavos: taxa,
      ...(rastreio ? { codigoRastreio: rastreio } : {}),
      // só o necessário para etiqueta e tela; nada de dados pessoais além da cidade
      dadosBrutos: {
        situacaoShein: p.orderStatus ?? null,
        logistica: "Shein",
        nfe: p.nfeInvoiceStatus ?? null,
        pacotes: (p.packageWaybillList ?? []).map((x) => x.packageNo).filter(Boolean),
        itens: itens.map((i) => ({ sku: i.sellerSku ?? null, titulo: i.goodsTitle ?? null })),
      },
    };

    let pedidoId: string;
    // pedido da Shein já chega pago: conta como venda ao entrar e desfaz se uma venda contada for cancelada
    let contar = false;
    let desfazer = false;
    if (ja) {
      const transicao =
        sit === "cancelado"
          ? await db
              .update(pedidos)
              .set({ situacao: sit })
              .where(and(eq(pedidos.id, ja.id), sql`${pedidos.situacao} not in ('cancelado', 'aguardando_pagamento', 'devolvido')`))
              .returning({ id: pedidos.id })
          : [];
      desfazer = transicao.length > 0;
      await db.update(pedidos).set(campos).where(eq(pedidos.id, ja.id));
      pedidoId = ja.id;
      atualizados++;
    } else {
      const recebido = p.receiveMsg;
      const uf = (recebido?.provinceCode ?? recebido?.province ?? recebido?.provinceName ?? "").trim();
      const [novo] = await db
        .insert(pedidos)
        .values({
          contaId,
          canal: "shein",
          conexaoId,
          idExterno: p.orderNo,
          anuncioId: anuncio?.id ?? null,
          pecaId: anuncio?.pecaId ?? null,
          cep: recebido?.postCode?.replace(/\D/g, "").slice(0, 8) || null,
          uf: /^[A-Za-z]{2}$/.test(uf) ? uf.toUpperCase() : null,
          cidade: recebido?.cityName ?? recebido?.city ?? null,
          valorVendaCentavos: valor,
          taxaEstimadaCentavos: taxaEstimada,
          logistica: "marketplace",
          documentoFiscal: "nfe",
          vendidoEm: data(p.orderTime ?? p.orderCreateTime ?? p.createTime) ?? new Date(),
          ...campos,
        })
        .onConflictDoNothing()
        .returning({ id: pedidos.id });
      if (!novo) continue;
      pedidoId = novo.id;
      novos++;
      contar = sit !== "cancelado";
    }
    if (anuncio && contar) await registrarVenda(anuncio, quantidade, "shein");
    if (anuncio && desfazer) await desfazerVenda(anuncio, quantidade, "shein");

    if (ja?.taxaReal == null && taxa != null && taxaEstimada != null && Math.abs(taxa - taxaEstimada) > TOLERANCIA_TAXA) {
      await db.insert(tarefas).values({
        contaId,
        tipo: "conferir_taxa",
        titulo: `Conferir a taxa: ${titulo}`,
        detalhe: "A taxa real da Shein veio diferente da estimada no anúncio.",
        pedidoId,
        pecaId: anuncio?.pecaId ?? null,
      });
      tarefasNovas++;
    }

    const abrir = async (tipo: "emitir_documento_fiscal" | "imprimir_etiqueta", tituloTarefa: string, detalhe: string) => {
      const [aberta] = await db
        .select({ id: tarefas.id })
        .from(tarefas)
        .where(and(eq(tarefas.pedidoId, pedidoId), eq(tarefas.tipo, tipo), eq(tarefas.situacao, "aberta")));
      if (aberta) return;
      await db.insert(tarefas).values({ contaId, tipo, titulo: tituloTarefa, detalhe, pedidoId, pecaId: anuncio?.pecaId ?? null });
      tarefasNovas++;
    };
    const fechar = (tipos: ("emitir_documento_fiscal" | "imprimir_etiqueta" | "despachar")[]) =>
      db
        .update(tarefas)
        .set({ situacao: "concluida", concluidaEm: new Date() })
        .where(and(eq(tarefas.pedidoId, pedidoId), inArray(tarefas.tipo, tipos), eq(tarefas.situacao, "aberta")));

    if (sit === "pago" || sit === "pronto_para_envio") {
      // no Brasil a Shein só libera a etiqueta com a NF-e do pedido enviada a ela
      if (faltaNfe) await abrir("emitir_documento_fiscal", `Emitir a NF-e: ${titulo}`, `Shein · pedido ${p.orderNo} · envie a nota no painel da Shein para liberar a etiqueta`);
      else await fechar(["emitir_documento_fiscal"]);
      await abrir("imprimir_etiqueta", `Imprimir etiqueta e despachar: ${titulo}`, `Shein · pedido ${p.orderNo}`);
    } else if (["enviado", "entregue", "cancelado", "devolvido"].includes(sit)) {
      await fechar(["emitir_documento_fiscal", "imprimir_etiqueta", "despachar"]);
    }
  }
  return { conta: nome, novos, atualizados, tarefasNovas };
}
