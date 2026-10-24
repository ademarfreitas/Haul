// Traz os SKUs de uma loja da Magalu para o inventário do Plist.
// Peça com o mesmo SKU já no Plist (ex.: veio do ML ou da Shopee) ganha o anúncio da Magalu em vez de
// virar peça nova. Rodar de novo atualiza título, preço, quantidade e situação; nada é apagado.
// Docs: developers.magalu.com/docs/apis/products (SKUs, Preços, Estoques). Preço e estoque vêm por SKU,
// um registro por canal; o Plist usa só o do canal Magazine Luiza.
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, fotosPeca, pecas } from "@/db/schema";
import type { ResultadoImportacao } from "@/lib/ml-importar";
import { canalVendaMagalu, chamarMagalu, idAnuncioMagalu, lojaMagaluValida, type Loja } from "@/lib/magalu";

const POR_PAGINA = 100;
const MAXIMO = 2000; // a paginação por offset da Magalu para em 5.000; brechó raramente passa de algumas centenas

type Pagina<T> = { meta?: { page?: { count?: number; limit?: number; offset?: number } }; results?: T[] };

type SkuMagalu = {
  sku: string;
  title?: string;
  description?: string;
  status?: string; // PUBLISHED, UNDER_REVIEW, BLOCKED, UNPUBLISHED, DELETED...
  active?: boolean;
  condition?: string; // NEW, USED
  brand?: string;
  fulfillment?: boolean;
  channels?: { id?: string }[];
  url_marketplace?: { channel?: string; url?: string }[];
  images?: (string | { url?: string })[];
};
type PrecoMagalu = { channel?: { id?: string }; price?: number; list_price?: number; normalizer?: number };
type EstoqueMagalu = { channel?: { id?: string }; type?: string; quantity?: number };

type Resumo = { item: SkuMagalu; precoCentavos: number; quantidade: number };

async function skusDaLoja(loja: Loja): Promise<SkuMagalu[]> {
  const lista: SkuMagalu[] = [];
  for (let offset = 0; offset < MAXIMO; offset += POR_PAGINA) {
    const r = await chamarMagalu<Pagina<SkuMagalu>>("/seller/v1/portfolios/skus", loja.accessToken, {
      consulta: { _limit: POR_PAGINA, _offset: offset },
    });
    const pagina = r.results ?? [];
    lista.push(...pagina);
    if (pagina.length < POR_PAGINA) break;
  }
  return lista.filter((s) => s.sku && s.status !== "DELETED");
}

// valor em centavos a partir de { valor, normalizer } (normalizer 100 = já em centavos)
export const centavosMagalu = (valor: number | undefined, normalizer: number | undefined) =>
  valor == null ? 0 : Math.round((valor / (normalizer || 100)) * 100);

async function precoEEstoque(loja: Loja, itens: SkuMagalu[]): Promise<Resumo[]> {
  const canal = canalVendaMagalu();
  const resumos: Resumo[] = [];
  for (const item of itens) {
    const caminho = encodeURIComponent(item.sku);
    const [precos, estoques] = await Promise.all([
      chamarMagalu<Pagina<PrecoMagalu>>(`/seller/v1/portfolios/prices/${caminho}`, loja.accessToken).catch(() => ({}) as Pagina<PrecoMagalu>),
      chamarMagalu<Pagina<EstoqueMagalu>>(`/seller/v1/portfolios/stocks/${caminho}`, loja.accessToken).catch(() => ({}) as Pagina<EstoqueMagalu>),
    ]);
    const preco = (precos.results ?? []).find((p) => p.channel?.id === canal) ?? precos.results?.[0];
    // só AVAILABLE está à venda; RESERVED já foi vendido e espera o envio
    const quantidade = (estoques.results ?? [])
      .filter((e) => e.type === "AVAILABLE" && (!e.channel?.id || e.channel.id === canal))
      .reduce((s, e) => s + (e.quantity ?? 0), 0);
    resumos.push({ item, precoCentavos: centavosMagalu(preco?.price ?? preco?.list_price, preco?.normalizer), quantidade });
  }
  return resumos;
}

function situacaoAnuncio(r: Resumo) {
  if (r.item.status === "UNDER_REVIEW") return "publicando" as const;
  if (r.item.status === "PUBLISHED" && r.item.active !== false && r.quantidade > 0) return "ativo" as const;
  return "pausado" as const;
}

const urlItem = (item: SkuMagalu) => item.url_marketplace?.find((u) => u.channel === "magazineluiza")?.url ?? null;

function dadosPeca(r: Resumo) {
  const { item } = r;
  return {
    titulo: item.title?.trim() || item.sku,
    descricao: item.description?.trim() || null,
    marca: item.brand?.trim() || null,
    // a Magalu só diz novo ou usado; o detalhe a pessoa ajusta depois
    condicao: item.condition === "NEW" ? ("nova_sem_etiqueta" as const) : item.condition === "USED" ? ("usada_bom_estado" as const) : null,
    precoCentavos: r.precoCentavos,
    quantidade: r.quantidade,
    situacao: "disponivel" as const,
  };
}

function fotos(item: SkuMagalu): string[] {
  return (item.images ?? [])
    .map((i) => (typeof i === "string" ? i : (i?.url ?? "")))
    .filter((u) => u.startsWith("https://"))
    .slice(0, 12);
}

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

export async function importarMagalu(conexaoId: string): Promise<ResultadoImportacao> {
  const db = obterDb();
  const [conexao] = await db.select().from(conexoesCanal).where(eq(conexoesCanal.id, conexaoId));
  if (!conexao) throw new Error("conexão não encontrada");
  const contaId = conexao.contaId;
  const loja = await lojaMagaluValida(conexaoId);
  const conta = conexao.apelido ?? conexao.usuarioExterno;

  // Full da Magalu: o estoque fica no CD dela e não entra na multivenda do Plist
  const todos = await skusDaLoja(loja);
  const itens = await precoEEstoque(loja, todos.filter((s) => !s.fulfillment));
  const total = todos.length;
  if (!itens.length) return { conta, novos: 0, atualizados: 0, total, deFora: total };

  const id = (r: Resumo) => idAnuncioMagalu(loja.tenant, r.item.sku);
  const existentes = new Map<string, { anuncioId: string; pecaId: string; contaId: string }>();
  for (const lote of emLotes(itens.map(id), 500)) {
    const linhas = await db
      .select({ idExterno: anuncios.idExterno, anuncioId: anuncios.id, pecaId: anuncios.pecaId, contaId: anuncios.contaId })
      .from(anuncios)
      .where(sql`${anuncios.canal} = 'magalu' and ${inArray(anuncios.idExterno, lote)}`);
    for (const l of linhas) existentes.set(l.idExterno!, l);
  }
  const daConta = itens.filter((r) => {
    const e = existentes.get(id(r));
    return !e || e.contaId === contaId;
  });
  const novos = daConta.filter((r) => !existentes.has(id(r)));
  const velhos = daConta.filter((r) => existentes.has(id(r)));

  // ---- novos: liga à peça de mesmo SKU que ainda não tem anúncio na Magalu; senão cria a peça ----
  if (novos.length) {
    const semMagalu = await db
      .select({ id: pecas.id, sku: pecas.sku })
      .from(pecas)
      .leftJoin(anuncios, and(eq(anuncios.pecaId, pecas.id), eq(anuncios.canal, "magalu")))
      .where(and(eq(pecas.contaId, contaId), isNull(anuncios.id)));
    const porSku = new Map(semMagalu.map((p) => [p.sku.toLowerCase(), p.id]));
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
        porSku.delete(proprio.toLowerCase()); // um anúncio da Magalu por peça
        continue;
      }
      // SKU já usado por uma peça que já tem anúncio na Magalu (ex.: outra loja da Magalu da mesma conta): ganha sufixo
      let sku = proprio;
      for (let n = 2; usados.has(sku.toLowerCase()); n++) sku = `${proprio}-MG${n}`;
      usados.add(sku.toLowerCase());
      criar.push({ r, sku });
    }

    for (const lote of emLotes(criar, 100)) {
      const criadas = await db
        .insert(pecas)
        .values(lote.map(({ r, sku }) => ({ contaId, sku, ...dadosPeca(r) })))
        .returning({ id: pecas.id });
      lote.forEach(({ r }, n) => pecaDe.set(r.item.sku, criadas[n].id));
      const linhasFotos = lote.flatMap(({ r }, n) => fotos(r.item).map((url, ordem) => ({ pecaId: criadas[n].id, url, ordem })));
      if (linhasFotos.length) await db.insert(fotosPeca).values(linhasFotos);
    }

    const agora = new Date();
    for (const lote of emLotes(novos, 200)) {
      await db.insert(anuncios).values(
        lote.map((r) => ({
          contaId,
          pecaId: pecaDe.get(r.item.sku)!,
          conexaoId,
          canal: "magalu" as const,
          idExterno: id(r),
          url: urlItem(r.item),
          titulo: r.item.title ?? r.item.sku,
          precoCentavos: r.precoCentavos,
          situacao: situacaoAnuncio(r),
          publicadoEm: agora,
        })),
      );
    }
  }

  // ---- já importados: um UPDATE ... FROM (VALUES ...) por lote ----
  for (const lote of emLotes(velhos, 200)) {
    const valoresAnuncio: SQL[] = lote.map((r) => {
      const e = existentes.get(id(r))!;
      return sql`(${e.anuncioId}::uuid, ${r.item.title ?? r.item.sku}, ${r.precoCentavos}::int, ${situacaoAnuncio(r)}::situacao_anuncio, ${urlItem(r.item)})`;
    });
    await db.execute(sql`
      update anuncios a set titulo = v.titulo, preco_centavos = v.preco, url = coalesce(v.url, a.url), conexao_id = ${conexaoId}::uuid,
        -- anúncio que o Plist tirou do ar (multivenda) ou já vendido continua assim até a peça voltar
        situacao = case when a.situacao in ('removido', 'vendido') then a.situacao else v.situacao end, atualizado_em = now()
      from (values ${sql.join(valoresAnuncio, sql`, `)}) as v(id, titulo, preco, situacao, url)
      where a.id = v.id`);

    // Só a quantidade da peça acompanha a Magalu: título, preço e fotos ficam com quem criou a peça.
    const valoresPeca: SQL[] = lote.map((r) => sql`(${existentes.get(id(r))!.pecaId}::uuid, ${r.quantidade}::int)`);
    await db.execute(sql`
      update pecas p set quantidade = v.quantidade, atualizado_em = now()
      from (values ${sql.join(valoresPeca, sql`, `)}) as v(id, quantidade)
      where p.id = v.id and p.situacao in ('rascunho', 'disponivel')`);
  }

  return { conta, novos: novos.length, atualizados: velhos.length, total, deFora: total - daConta.length };
}
