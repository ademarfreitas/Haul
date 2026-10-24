// Traz os anúncios ativos e deslistados de uma loja da Shopee para o inventário do Plist.
// Peça com o mesmo SKU já no Plist (ex.: veio do Mercado Livre) ganha o anúncio da Shopee em vez de
// virar peça nova: é assim que a mesma peça fica ligada aos dois canais. Rodar de novo atualiza
// título, preço, quantidade e situação; nada é apagado.
// Docs: https://open.shopee.com/documents/v2/v2.product.get_item_list e v2.product.get_item_base_info
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, fotosPeca, pecas } from "@/db/schema";
import type { ResultadoImportacao } from "@/lib/ml-importar";
import { chamarShopee, lojaValida } from "@/lib/shopee";

const POR_PAGINA = 100; // máximo do get_item_list
const POR_BASE_INFO = 50; // máximo do get_item_base_info

type Loja = { accessToken: string; shopId: number };
type Preco = { current_price?: number; original_price?: number };
type Estoque = { summary_info?: { total_available_stock?: number } };

type ItemShopee = {
  item_id: number;
  item_name: string;
  item_sku?: string;
  item_status: string; // NORMAL, UNLIST, BANNED, REVIEWING...
  category_id?: number;
  condition?: string; // NEW, USED
  has_model?: boolean;
  price_info?: Preco[];
  stock_info_v2?: Estoque;
  image?: { image_url_list?: string[] };
  weight?: string; // kg
  dimension?: { package_length?: number; package_width?: number; package_height?: number };
  brand?: { original_brand_name?: string };
};

type ListaItens = { response?: { item?: { item_id: number }[]; total_count?: number; has_next_page?: boolean; next_offset?: number } };
type BaseInfo = { response?: { item_list?: ItemShopee[] } };
type Modelos = { response?: { model?: { price_info?: Preco[]; stock_info_v2?: Estoque }[] } };

const SITUACAO_ANUNCIO = { NORMAL: "ativo", UNLIST: "pausado" } as const;

async function idsDaLoja(loja: Loja, status: "NORMAL" | "UNLIST") {
  const ids: number[] = [];
  let total = 0;
  for (let offset = 0; ; ) {
    const r = await chamarShopee<ListaItens>("/api/v2/product/get_item_list", loja, {
      consulta: { offset, page_size: POR_PAGINA, item_status: status },
    });
    total = r.response?.total_count ?? 0;
    ids.push(...(r.response?.item ?? []).map((i) => i.item_id));
    if (!r.response?.has_next_page || r.response.next_offset == null) break;
    offset = r.response.next_offset;
  }
  return { ids, total };
}

// Preço e estoque: no item simples vêm no próprio item; com variações (models), soma o estoque e usa o menor preço.
type Resumo = { item: ItemShopee; precoCentavos: number; quantidade: number };

async function buscarItens(ids: number[], loja: Loja): Promise<Resumo[]> {
  const itens: Resumo[] = [];
  for (let i = 0; i < ids.length; i += POR_BASE_INFO) {
    const r = await chamarShopee<BaseInfo>("/api/v2/product/get_item_base_info", loja, {
      consulta: { item_id_list: ids.slice(i, i + POR_BASE_INFO).join(",") },
    });
    for (const item of r.response?.item_list ?? []) {
      if (!item.has_model) {
        itens.push({ item, precoCentavos: centavos(item.price_info?.[0]), quantidade: item.stock_info_v2?.summary_info?.total_available_stock ?? 0 });
        continue;
      }
      const m = await chamarShopee<Modelos>("/api/v2/product/get_model_list", loja, { consulta: { item_id: item.item_id } });
      const modelos = m.response?.model ?? [];
      const precos = modelos.map((x) => centavos(x.price_info?.[0])).filter((p) => p > 0);
      itens.push({
        item,
        precoCentavos: precos.length ? Math.min(...precos) : 0,
        quantidade: modelos.reduce((s, x) => s + (x.stock_info_v2?.summary_info?.total_available_stock ?? 0), 0),
      });
    }
  }
  return itens;
}

function centavos(p: Preco | undefined): number {
  return Math.round((p?.current_price ?? p?.original_price ?? 0) * 100);
}

function dadosPeca(r: Resumo) {
  const { item } = r;
  const d = item.dimension;
  return {
    titulo: item.item_name,
    marca: item.brand?.original_brand_name && item.brand.original_brand_name !== "NoBrand" ? item.brand.original_brand_name : null,
    // a Shopee só diz novo ou usado; o detalhe a pessoa ajusta depois
    condicao: item.condition === "NEW" ? ("nova_sem_etiqueta" as const) : item.condition === "USED" ? ("usada_bom_estado" as const) : null,
    precoCentavos: r.precoCentavos,
    quantidade: r.quantidade,
    pesoGramas: item.weight ? Math.round(Number(item.weight) * 1000) || null : null,
    alturaCm: d?.package_height || null,
    larguraCm: d?.package_width || null,
    comprimentoCm: d?.package_length || null,
    atributos: { shopee_categoria: String(item.category_id ?? "") },
    situacao: "disponivel" as const,
  };
}

function fotos(item: ItemShopee): string[] {
  return (item.image?.image_url_list ?? []).filter(Boolean).slice(0, 12);
}

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

export async function importarShopee(conexaoId: string): Promise<ResultadoImportacao> {
  const db = obterDb();
  const [conexao] = await db.select().from(conexoesCanal).where(eq(conexoesCanal.id, conexaoId));
  if (!conexao) throw new Error("conexão não encontrada");
  const contaId = conexao.contaId;
  const loja = await lojaValida(conexaoId);
  const urlItem = (id: number) => `https://shopee.com.br/product/${loja.shopId}/${id}`;

  const ativos = await idsDaLoja(loja, "NORMAL");
  const pausados = await idsDaLoja(loja, "UNLIST");
  const itens = await buscarItens([...new Set([...ativos.ids, ...pausados.ids])], loja);
  const total = ativos.total + pausados.total;
  const conta = conexao.apelido ?? conexao.usuarioExterno;
  if (!itens.length) return { conta, novos: 0, atualizados: 0, total, deFora: total };

  const existentes = new Map<string, { anuncioId: string; pecaId: string; contaId: string }>();
  for (const lote of emLotes(itens.map((r) => String(r.item.item_id)), 500)) {
    const linhas = await db
      .select({ idExterno: anuncios.idExterno, anuncioId: anuncios.id, pecaId: anuncios.pecaId, contaId: anuncios.contaId })
      .from(anuncios)
      .where(sql`${anuncios.canal} = 'shopee' and ${inArray(anuncios.idExterno, lote)}`);
    for (const l of linhas) existentes.set(l.idExterno!, l);
  }
  const daConta = itens.filter((r) => {
    const e = existentes.get(String(r.item.item_id));
    return !e || e.contaId === contaId;
  });
  const novos = daConta.filter((r) => !existentes.has(String(r.item.item_id)));
  const velhos = daConta.filter((r) => existentes.has(String(r.item.item_id)));

  // ---- novos: liga à peça de mesmo SKU que ainda não tem anúncio na Shopee; senão cria a peça ----
  if (novos.length) {
    const semShopee = await db
      .select({ id: pecas.id, sku: pecas.sku })
      .from(pecas)
      .leftJoin(anuncios, and(eq(anuncios.pecaId, pecas.id), eq(anuncios.canal, "shopee")))
      .where(and(eq(pecas.contaId, contaId), isNull(anuncios.id)));
    const porSku = new Map(semShopee.map((p) => [p.sku.toLowerCase(), p.id]));
    const usados = new Set(
      (await db.select({ sku: pecas.sku }).from(pecas).where(eq(pecas.contaId, contaId))).map((p) => p.sku.toLowerCase()),
    );

    const pecaDe = new Map<number, string>();
    const criar: { r: Resumo; sku: string }[] = [];
    for (const r of novos) {
      const proprio = (r.item.item_sku ?? "").trim().slice(0, 60);
      const ligada = proprio ? porSku.get(proprio.toLowerCase()) : undefined;
      if (ligada) {
        pecaDe.set(r.item.item_id, ligada);
        porSku.delete(proprio.toLowerCase()); // um anúncio da Shopee por peça
        continue;
      }
      // SKU do vendedor na Shopee; sem ele, SP + item_id. Repetido na conta ganha o item_id no fim.
      let sku = proprio || `SP${r.item.item_id}`;
      if (usados.has(sku.toLowerCase())) sku = `${proprio}-${r.item.item_id}`;
      usados.add(sku.toLowerCase());
      criar.push({ r, sku });
    }

    for (const lote of emLotes(criar, 100)) {
      const criadas = await db
        .insert(pecas)
        .values(lote.map(({ r, sku }) => ({ contaId, sku, ...dadosPeca(r) })))
        .returning({ id: pecas.id });
      lote.forEach(({ r }, n) => pecaDe.set(r.item.item_id, criadas[n].id));
      const linhasFotos = lote.flatMap(({ r }, n) => fotos(r.item).map((url, ordem) => ({ pecaId: criadas[n].id, url, ordem })));
      if (linhasFotos.length) await db.insert(fotosPeca).values(linhasFotos);
    }

    const agora = new Date();
    for (const lote of emLotes(novos, 200)) {
      await db.insert(anuncios).values(
        lote.map((r) => ({
          contaId,
          pecaId: pecaDe.get(r.item.item_id)!,
          conexaoId,
          canal: "shopee" as const,
          idExterno: String(r.item.item_id),
          url: urlItem(r.item.item_id),
          titulo: r.item.item_name,
          precoCentavos: r.precoCentavos,
          situacao: SITUACAO_ANUNCIO[r.item.item_status as keyof typeof SITUACAO_ANUNCIO] ?? ("pausado" as const),
          publicadoEm: agora,
        })),
      );
    }
  }

  // ---- já importados: um UPDATE ... FROM (VALUES ...) por lote ----
  for (const lote of emLotes(velhos, 200)) {
    const valoresAnuncio: SQL[] = lote.map((r) => {
      const e = existentes.get(String(r.item.item_id))!;
      const situacao = SITUACAO_ANUNCIO[r.item.item_status as keyof typeof SITUACAO_ANUNCIO] ?? "pausado";
      return sql`(${e.anuncioId}::uuid, ${r.item.item_name}, ${r.precoCentavos}::int, ${situacao}::situacao_anuncio, ${urlItem(r.item.item_id)})`;
    });
    await db.execute(sql`
      update anuncios a set titulo = v.titulo, preco_centavos = v.preco, situacao = v.situacao, url = v.url,
        conexao_id = ${conexaoId}::uuid, atualizado_em = now()
      from (values ${sql.join(valoresAnuncio, sql`, `)}) as v(id, titulo, preco, situacao, url)
      where a.id = v.id`);

    // Só a quantidade da peça acompanha a Shopee: título, preço e fotos da peça ficam com quem a criou
    // (a mesma peça pode estar no ML com outro título), e o anúncio guarda os da Shopee.
    const valoresPeca: SQL[] = lote.map((r) => sql`(${existentes.get(String(r.item.item_id))!.pecaId}::uuid, ${r.quantidade}::int)`);
    await db.execute(sql`
      update pecas p set quantidade = v.quantidade, atualizado_em = now()
      from (values ${sql.join(valoresPeca, sql`, `)}) as v(id, quantidade)
      where p.id = v.id and p.situacao in ('rascunho', 'disponivel')`);
  }

  return { conta, novos: novos.length, atualizados: velhos.length, total, deFora: total - daConta.length };
}
