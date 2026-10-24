// Traz os anúncios (listings) de uma conta da Amazon.com.br para o inventário do Plist.
// Na Amazon o anúncio é identificado pelo SKU do vendedor: peça com o mesmo SKU já no Plist (ex.: veio
// do ML) ganha o anúncio da Amazon em vez de virar peça nova. Rodar de novo atualiza título, preço,
// quantidade e situação; nada é apagado.
// Docs: https://developer-docs.amazon.com/sp-api/docs/listings-items-api-v2021-08-01-reference (searchListingsItems)
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, fotosPeca, pecas } from "@/db/schema";
import type { ResultadoImportacao } from "@/lib/ml-importar";
import { chamarAmazon, contaAmazonValida, MARKETPLACE_BR } from "@/lib/amazon";

const POR_PAGINA = 20; // máximo do searchListingsItems
const LIMITE = 2000;

// O SKU só é único dentro de cada vendedor: o id do anúncio no Plist leva o vendedor junto.
export const idAnuncioAmazon = (vendedorId: string, sku: string) => `${vendedorId}:${sku}`;
export const skuDoAnuncio = (idExterno: string) => idExterno.slice(idExterno.indexOf(":") + 1);
export const urlAmazon = (asin: string | undefined) => (asin ? `https://www.amazon.com.br/dp/${asin}` : null);

export type ItemAmazon = {
  sku: string;
  summaries?: {
    marketplaceId: string;
    asin?: string;
    productType: string;
    conditionType?: string;
    status: string[]; // BUYABLE, DISCOVERABLE
    itemName?: string;
    mainImage?: { link: string };
  }[];
  offers?: { marketplaceId: string; offerType: string; price: { amount: string } }[];
  fulfillmentAvailability?: { fulfillmentChannelCode: string; quantity?: number }[];
};

type Busca = { numberOfResults: number; items: ItemAmazon[]; pagination?: { nextToken?: string } };

// conditionType da Amazon → condição da peça no Plist (o detalhe a pessoa ajusta depois)
const CONDICAO: Record<string, "nova_sem_etiqueta" | "seminova" | "usada_bom_estado" | "usada_com_detalhes"> = {
  new_new: "nova_sem_etiqueta",
  new_open_box: "nova_sem_etiqueta",
  new_oem: "nova_sem_etiqueta",
  used_like_new: "seminova",
  used_very_good: "usada_bom_estado",
  used_good: "usada_bom_estado",
  used_acceptable: "usada_com_detalhes",
};

export type Resumo = { item: ItemAmazon; titulo: string; asin?: string; tipo?: string; precoCentavos: number; quantidade: number; ativo: boolean; fba: boolean };

export function resumir(item: ItemAmazon): Resumo {
  const s = item.summaries?.find((x) => x.marketplaceId === MARKETPLACE_BR) ?? item.summaries?.[0];
  const oferta = item.offers?.find((o) => o.marketplaceId === MARKETPLACE_BR && o.offerType === "B2C") ?? item.offers?.[0];
  const disp = item.fulfillmentAvailability ?? [];
  return {
    item,
    titulo: s?.itemName || item.sku,
    asin: s?.asin,
    tipo: s?.productType,
    precoCentavos: Math.round(Number(oferta?.price.amount ?? 0) * 100) || 0,
    quantidade: disp.reduce((t, d) => t + (d.quantity ?? 0), 0),
    ativo: !!s?.status.includes("BUYABLE"),
    // DEFAULT é o estoque do vendedor (DBA ou envio próprio); os outros códigos são centros da Amazon (FBA)
    fba: disp.some((d) => d.fulfillmentChannelCode !== "DEFAULT"),
  };
}

async function itensDaConta(token: string, vendedorId: string): Promise<{ itens: Resumo[]; total: number }> {
  const itens: Resumo[] = [];
  let total = 0;
  let pageToken: string | undefined;
  do {
    const r = await chamarAmazon<Busca>(`/listings/2021-08-01/items/${encodeURIComponent(vendedorId)}`, token, {
      consulta: { marketplaceIds: MARKETPLACE_BR, includedData: "summaries,offers,fulfillmentAvailability", pageSize: POR_PAGINA, pageToken },
    });
    total = r.numberOfResults ?? 0;
    itens.push(...(r.items ?? []).map(resumir));
    pageToken = r.pagination?.nextToken;
  } while (pageToken && itens.length < LIMITE);
  return { itens, total };
}

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

export async function importarAmazon(conexaoId: string): Promise<ResultadoImportacao> {
  const db = obterDb();
  const [conexao] = await db.select().from(conexoesCanal).where(eq(conexoesCanal.id, conexaoId));
  if (!conexao) throw new Error("conexão não encontrada");
  const contaId = conexao.contaId;
  const { token, vendedorId } = await contaAmazonValida(conexaoId);
  const conta = conexao.apelido ?? vendedorId;

  const { itens, total } = await itensDaConta(token, vendedorId);
  if (!itens.length) return { conta, novos: 0, atualizados: 0, total, deFora: total };
  const idDe = (r: Resumo) => idAnuncioAmazon(vendedorId, r.item.sku);

  const existentes = new Map<string, { anuncioId: string; pecaId: string; contaId: string }>();
  for (const lote of emLotes(itens.map(idDe), 500)) {
    const linhas = await db
      .select({ idExterno: anuncios.idExterno, anuncioId: anuncios.id, pecaId: anuncios.pecaId, contaId: anuncios.contaId })
      .from(anuncios)
      .where(sql`${anuncios.canal} = 'amazon' and ${inArray(anuncios.idExterno, lote)}`);
    for (const l of linhas) existentes.set(l.idExterno!, l);
  }
  const daConta = itens.filter((r) => {
    const e = existentes.get(idDe(r));
    return !e || e.contaId === contaId;
  });
  const novos = daConta.filter((r) => !existentes.has(idDe(r)));
  const velhos = daConta.filter((r) => existentes.has(idDe(r)));
  const situacao = (r: Resumo) => (r.ativo ? ("ativo" as const) : ("pausado" as const));

  // ---- novos: liga à peça de mesmo SKU que ainda não tem anúncio na Amazon; senão cria a peça ----
  if (novos.length) {
    const semAmazon = await db
      .select({ id: pecas.id, sku: pecas.sku })
      .from(pecas)
      .leftJoin(anuncios, and(eq(anuncios.pecaId, pecas.id), eq(anuncios.canal, "amazon")))
      .where(and(eq(pecas.contaId, contaId), isNull(anuncios.id)));
    const porSku = new Map(semAmazon.map((p) => [p.sku.toLowerCase(), p.id]));
    const usados = new Set(
      (await db.select({ sku: pecas.sku }).from(pecas).where(eq(pecas.contaId, contaId))).map((p) => p.sku.toLowerCase()),
    );

    const pecaDe = new Map<string, string>();
    const criar: { r: Resumo; sku: string }[] = [];
    for (const r of novos) {
      const proprio = r.item.sku.trim().slice(0, 60);
      const ligada = porSku.get(proprio.toLowerCase());
      if (ligada) {
        pecaDe.set(r.item.sku, ligada);
        porSku.delete(proprio.toLowerCase()); // um anúncio da Amazon por peça
        continue;
      }
      // o SKU da Amazon já é do vendedor; repetido na conta (peça que já tem anúncio na Amazon) ganha o ASIN no fim
      let sku = proprio;
      if (usados.has(sku.toLowerCase())) sku = `${proprio}-${r.asin ?? "AZ"}`;
      usados.add(sku.toLowerCase());
      criar.push({ r, sku });
    }

    for (const lote of emLotes(criar, 100)) {
      const criadas = await db
        .insert(pecas)
        .values(
          lote.map(({ r, sku }) => ({
            contaId,
            sku,
            titulo: r.titulo,
            condicao: CONDICAO[r.item.summaries?.[0]?.conditionType ?? ""] ?? null,
            precoCentavos: r.precoCentavos,
            quantidade: r.quantidade,
            atributos: { amazon_tipo_produto: r.tipo ?? "", amazon_asin: r.asin ?? "" },
            situacao: "disponivel" as const,
          })),
        )
        .returning({ id: pecas.id });
      lote.forEach(({ r }, n) => pecaDe.set(r.item.sku, criadas[n].id));
      // a listagem só traz a foto principal; as outras ficam no catálogo da Amazon
      const linhasFotos = lote.flatMap(({ r }, n) => {
        const foto = r.item.summaries?.[0]?.mainImage?.link;
        return foto ? [{ pecaId: criadas[n].id, url: foto, ordem: 0 }] : [];
      });
      if (linhasFotos.length) await db.insert(fotosPeca).values(linhasFotos);
    }

    const agora = new Date();
    for (const lote of emLotes(novos, 200)) {
      await db.insert(anuncios).values(
        lote.map((r) => ({
          contaId,
          pecaId: pecaDe.get(r.item.sku)!,
          conexaoId,
          canal: "amazon" as const,
          idExterno: idDe(r),
          url: urlAmazon(r.asin),
          titulo: r.titulo,
          precoCentavos: r.precoCentavos,
          situacao: situacao(r),
          publicadoEm: agora,
        })),
      );
    }
  }

  // ---- já importados: um UPDATE ... FROM (VALUES ...) por lote ----
  for (const lote of emLotes(velhos, 200)) {
    const valoresAnuncio: SQL[] = lote.map((r) => {
      const e = existentes.get(idDe(r))!;
      return sql`(${e.anuncioId}::uuid, ${r.titulo}, ${r.precoCentavos}::int, ${situacao(r)}::situacao_anuncio, ${urlAmazon(r.asin)})`;
    });
    await db.execute(sql`
      update anuncios a set titulo = v.titulo, preco_centavos = v.preco, situacao = v.situacao, url = coalesce(v.url, a.url),
        conexao_id = ${conexaoId}::uuid, atualizado_em = now()
      from (values ${sql.join(valoresAnuncio, sql`, `)}) as v(id, titulo, preco, situacao, url)
      where a.id = v.id and a.situacao not in ('vendido', 'removido')`);

    // Só a quantidade da peça acompanha a Amazon (título, preço e fotos ficam com quem criou a peça).
    // Anúncio FBA não mexe na peça: o estoque dele está no centro da Amazon.
    const comEstoque = lote.filter((r) => !r.fba);
    if (!comEstoque.length) continue;
    const valoresPeca: SQL[] = comEstoque.map((r) => sql`(${existentes.get(idDe(r))!.pecaId}::uuid, ${r.quantidade}::int)`);
    await db.execute(sql`
      update pecas p set quantidade = v.quantidade, atualizado_em = now()
      from (values ${sql.join(valoresPeca, sql`, `)}) as v(id, quantidade)
      where p.id = v.id and p.situacao in ('rascunho', 'disponivel')`);
  }

  return { conta, novos: novos.length, atualizados: velhos.length, total, deFora: total - daConta.length };
}
