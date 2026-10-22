// Traz os anúncios ativos e pausados de uma conta do Mercado Livre para o inventário do Plist.
// Cada anúncio vira uma peça (pecas) com o seu anúncio (anuncios) e fotos (fotos_peca). Rodar de novo
// atualiza título, preço, quantidade e situação; nada é apagado.
// Docs: https://developers.mercadolivre.com.br/pt-br/itens-e-buscas (busca por vendedor, multiget de /items)
import { eq, inArray, sql, type SQL } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, fotosPeca, pecas } from "@/db/schema";
import { chamarApi, tokenValido } from "@/lib/mercado-livre";

// a busca por offset do ML para em 1000 resultados por consulta
const LIMITE_BUSCA = 1000;
const POR_PAGINA = 100;
const POR_MULTIGET = 20; // máximo do /items?ids=
const CAMPOS =
  "id,title,price,available_quantity,condition,permalink,pictures,status,category_id,seller_custom_field,attributes,variations";

type ItemMl = {
  id: string;
  title: string;
  price: number;
  available_quantity: number;
  condition?: string;
  permalink?: string;
  pictures?: { secure_url?: string; url?: string }[];
  status: string;
  category_id?: string;
  seller_custom_field?: string | null;
  attributes?: { id: string; value_name?: string | null }[];
  variations?: { available_quantity?: number }[];
};

type Busca = { results: string[]; paging: { total: number } };

export type ResultadoImportacao = { conta: string; novos: number; atualizados: number; total: number; deFora: number };

const SITUACAO_ANUNCIO = { active: "ativo", paused: "pausado" } as const;

async function idsDoVendedor(vendedor: string, status: "active" | "paused", token: string) {
  const ids: string[] = [];
  let total = 0;
  for (let offset = 0; offset < LIMITE_BUSCA; offset += POR_PAGINA) {
    const r = await chamarApi<Busca>(`/users/${vendedor}/items/search?status=${status}&limit=${POR_PAGINA}&offset=${offset}`, token);
    total = r.paging.total;
    ids.push(...r.results);
    if (r.results.length < POR_PAGINA || ids.length >= total) break;
  }
  return { ids, total };
}

async function buscarItens(ids: string[], token: string): Promise<ItemMl[]> {
  const itens: ItemMl[] = [];
  for (let i = 0; i < ids.length; i += POR_MULTIGET) {
    const lote = ids.slice(i, i + POR_MULTIGET).join(",");
    const r = await chamarApi<({ code: number; body: ItemMl } | ItemMl)[]>(`/items?ids=${lote}&attributes=${CAMPOS}`, token);
    for (const x of r) {
      const item = "body" in x ? (x.code === 200 ? x.body : null) : x;
      if (item?.id) itens.push(item);
    }
  }
  return itens;
}

function atributo(item: ItemMl, id: string): string | null {
  return item.attributes?.find((a) => a.id === id)?.value_name?.trim() || null;
}

function quantidade(item: ItemMl): number {
  if (item.variations?.length) return item.variations.reduce((s, v) => s + (v.available_quantity ?? 0), 0);
  return item.available_quantity ?? 0;
}

function dadosPeca(item: ItemMl) {
  const ficha: Record<string, string> = { ml_categoria: item.category_id ?? "" };
  for (const a of item.attributes ?? []) if (a.value_name) ficha[a.id] = a.value_name;
  return {
    titulo: item.title,
    marca: atributo(item, "BRAND"),
    cor: atributo(item, "COLOR"),
    tamanho: atributo(item, "SIZE"),
    // o ML só diz novo ou usado; o detalhe (com etiqueta, com marcas de uso) a pessoa ajusta depois
    condicao: item.condition === "new" ? ("nova_sem_etiqueta" as const) : item.condition === "used" ? ("usada_bom_estado" as const) : null,
    precoCentavos: Math.round(item.price * 100),
    quantidade: quantidade(item),
    atributos: ficha,
    situacao: "disponivel" as const,
  };
}

function fotos(item: ItemMl): string[] {
  return (item.pictures ?? []).map((p) => p.secure_url ?? p.url ?? "").filter(Boolean).slice(0, 12);
}

// SKU do vendedor no ML; sem ele, o próprio MLB. Repetido na conta ganha o MLB no fim.
function escolherSku(item: ItemMl, usados: Set<string>): string {
  const proprio = (item.seller_custom_field || atributo(item, "SELLER_SKU") || "").trim().slice(0, 60);
  let sku = proprio || item.id;
  if (usados.has(sku.toLowerCase())) sku = `${proprio}-${item.id}`;
  usados.add(sku.toLowerCase());
  return sku;
}

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

export async function importarMercadoLivre(conexaoId: string): Promise<ResultadoImportacao> {
  const db = obterDb();
  const [conexao] = await db.select().from(conexoesCanal).where(eq(conexoesCanal.id, conexaoId));
  if (!conexao) throw new Error("conexão não encontrada");
  const contaId = conexao.contaId;
  const token = await tokenValido(conexaoId);

  const ativos = await idsDoVendedor(conexao.usuarioExterno, "active", token);
  const pausados = await idsDoVendedor(conexao.usuarioExterno, "paused", token);
  const itens = await buscarItens([...new Set([...ativos.ids, ...pausados.ids])], token);
  const total = ativos.total + pausados.total;
  if (!itens.length) return { conta: conexao.apelido ?? conexao.usuarioExterno, novos: 0, atualizados: 0, total, deFora: total };

  const existentes = new Map<string, { anuncioId: string; pecaId: string; contaId: string }>();
  for (const lote of emLotes(itens.map((i) => i.id), 500)) {
    const linhas = await db
      .select({ idExterno: anuncios.idExterno, anuncioId: anuncios.id, pecaId: anuncios.pecaId, contaId: anuncios.contaId })
      .from(anuncios)
      .where(sql`${anuncios.canal} = 'mercado_livre' and ${inArray(anuncios.idExterno, lote)}`);
    for (const l of linhas) existentes.set(l.idExterno!, l);
  }
  // anúncio que já é de outra conta do Plist fica de fora (não deveria acontecer: uma conta do ML, um dono)
  const daConta = itens.filter((i) => !existentes.has(i.id) || existentes.get(i.id)!.contaId === contaId);
  const novos = daConta.filter((i) => !existentes.has(i.id));
  const velhos = daConta.filter((i) => existentes.has(i.id));

  // ---- novos: peça, anúncio e fotos em lote ----
  if (novos.length) {
    const usados = new Set(
      (await db.select({ sku: pecas.sku }).from(pecas).where(eq(pecas.contaId, contaId))).map((p) => p.sku.toLowerCase()),
    );
    for (const lote of emLotes(novos, 100)) {
      const criadas = await db
        .insert(pecas)
        .values(lote.map((i) => ({ contaId, sku: escolherSku(i, usados), ...dadosPeca(i) })))
        .returning({ id: pecas.id });
      const agora = new Date();
      await db.insert(anuncios).values(
        lote.map((i, n) => ({
          contaId,
          pecaId: criadas[n].id,
          conexaoId,
          canal: "mercado_livre" as const,
          idExterno: i.id,
          url: i.permalink ?? null,
          titulo: i.title,
          precoCentavos: Math.round(i.price * 100),
          situacao: SITUACAO_ANUNCIO[i.status as keyof typeof SITUACAO_ANUNCIO] ?? ("pausado" as const),
          publicadoEm: agora,
        })),
      );
      const linhasFotos = lote.flatMap((i, n) => fotos(i).map((url, ordem) => ({ pecaId: criadas[n].id, url, ordem })));
      if (linhasFotos.length) await db.insert(fotosPeca).values(linhasFotos);
    }
  }

  // ---- já importados: um UPDATE ... FROM (VALUES ...) por lote, para não fazer uma ida ao banco por anúncio ----
  for (const lote of emLotes(velhos, 200)) {
    const valoresAnuncio: SQL[] = lote.map((i) => {
      const e = existentes.get(i.id)!;
      const situacao = SITUACAO_ANUNCIO[i.status as keyof typeof SITUACAO_ANUNCIO] ?? "pausado";
      return sql`(${e.anuncioId}::uuid, ${i.title}, ${Math.round(i.price * 100)}::int, ${situacao}::situacao_anuncio, ${i.permalink ?? null})`;
    });
    await db.execute(sql`
      update anuncios a set titulo = v.titulo, preco_centavos = v.preco, situacao = v.situacao, url = v.url,
        conexao_id = ${conexaoId}::uuid, atualizado_em = now()
      from (values ${sql.join(valoresAnuncio, sql`, `)}) as v(id, titulo, preco, situacao, url)
      where a.id = v.id`);

    // a peça só muda se ainda estiver como veio do ML (vendida ou arquivada no Plist não volta a disponível)
    const valoresPeca: SQL[] = lote.map((i) => {
      const e = existentes.get(i.id)!;
      return sql`(${e.pecaId}::uuid, ${i.title}, ${Math.round(i.price * 100)}::int, ${quantidade(i)}::int)`;
    });
    await db.execute(sql`
      update pecas p set titulo = v.titulo, preco_centavos = v.preco, quantidade = v.quantidade, atualizado_em = now()
      from (values ${sql.join(valoresPeca, sql`, `)}) as v(id, titulo, preco, quantidade)
      where p.id = v.id and p.situacao in ('rascunho', 'disponivel')`);

    // fotos: troca pelas do ML (podem ter mudado lá)
    const pecaIds = lote.map((i) => existentes.get(i.id)!.pecaId);
    await db.delete(fotosPeca).where(inArray(fotosPeca.pecaId, pecaIds));
    const linhasFotos = lote.flatMap((i) => fotos(i).map((url, ordem) => ({ pecaId: existentes.get(i.id)!.pecaId, url, ordem })));
    if (linhasFotos.length) await db.insert(fotosPeca).values(linhasFotos);
  }

  return {
    conta: conexao.apelido ?? conexao.usuarioExterno,
    novos: novos.length,
    atualizados: velhos.length,
    total,
    deFora: total - daConta.length,
  };
}
