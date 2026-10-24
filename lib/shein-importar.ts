// Traz os produtos de uma loja da Shein para o inventário do Plist.
// Na Shein o produto é um SPU; cada cor é um SKC (é o SKC que entra e sai da vitrine) e cada tamanho é um
// SKU. No Plist, um SKC vira um anúncio (idExterno = "<spu>:<skc>"), com o menor preço e a soma do estoque
// dos tamanhos. O SKU do vendedor (supplierSku) é o que liga à peça que já existe no Plist, como na Shopee.
// Rodar de novo atualiza título, preço, quantidade e situação; nada é apagado.
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, fotosPeca, pecas } from "@/db/schema";
import type { ResultadoImportacao } from "@/lib/ml-importar";
import { CAMINHOS_SHEIN, centavosShein, chamarShein, comChaves, horaShein, textoNoIdioma, type ChavesShein } from "@/lib/shein";

const POR_PAGINA = 10; // máximo do searchProduct
const MAXIMO_SPU = 300; // 30 páginas: cabe no tempo de uma ação na Vercel

type SkuShein = {
  skuCode?: string;
  supplierSku?: string;
  priceList?: { basePrice?: number | string; specialPrice?: number | string; currency?: string }[];
  inventoryList?: { inventoryNum?: number | string }[];
};
export type SkcShein = {
  skcName?: string;
  skcTitle?: unknown; // [{ language, title }]
  supplierCode?: string;
  skcMainPicUrl?: string;
  skcShelfStatus?: number | string; // 1 na vitrine, 0 fora
  skuList?: SkuShein[];
};
export type SpuShein = { spuName?: string; spuShelfStatus?: number | string; categoryId?: number | string; skcList?: SkcShein[] };

type Resumo = { idExterno: string; spu: SpuShein; skc: SkcShein; titulo: string; precoCentavos: number; quantidade: number; sku: string };

export const idAnuncioShein = (spuName: string, skcName: string) => `${spuName}:${skcName}`;

async function produtos(chaves: ChavesShein): Promise<{ lista: SpuShein[] }> {
  const lista: SpuShein[] = [];
  let total = 0;
  for (let pagina = 1; lista.length < MAXIMO_SPU; pagina++) {
    const info = await chamarShein<{ data?: SpuShein[]; meta?: { count?: number } } | null>(CAMINHOS_SHEIN.produtos, chaves, {
      json: {
        pageNum: pagina,
        pageSize: POR_PAGINA,
        languageList: ["pt-br"],
        createTimeStart: "2020-01-01 00:00:00",
        createTimeEnd: horaShein(new Date()),
      },
    });
    const dados = info?.data ?? [];
    total = Number(info?.meta?.count ?? total) || total;
    lista.push(...dados);
    if (dados.length < POR_PAGINA || (total && pagina * POR_PAGINA >= total)) break;
  }
  return { lista };
}

// menor preço (promocional, se houver) e soma do estoque dos tamanhos do SKC
export function resumirSkc(skc: SkcShein) {
  const skus = skc.skuList ?? [];
  const precos = skus
    .flatMap((s) => s.priceList ?? [])
    .map((p) => centavosShein(p.specialPrice) || centavosShein(p.basePrice))
    .filter((p) => p > 0);
  return {
    precoCentavos: precos.length ? Math.min(...precos) : 0,
    quantidade: skus.reduce((soma, s) => soma + (s.inventoryList ?? []).reduce((q, i) => q + (Number(i.inventoryNum) || 0), 0), 0),
  };
}

function resumir(spus: SpuShein[]): Resumo[] {
  const lista: Resumo[] = [];
  for (const spu of spus) {
    for (const skc of spu.skcList ?? []) {
      if (!spu.spuName || !skc.skcName) continue;
      const skus = skc.skuList ?? [];
      // um tamanho só (o caso do brechó): o SKU do vendedor é o da peça; com vários, o código do SKC
      const sku = (skus.length === 1 ? skus[0].supplierSku : skc.supplierCode) ?? skus[0]?.supplierSku ?? "";
      lista.push({
        idExterno: idAnuncioShein(spu.spuName, skc.skcName),
        spu,
        skc,
        titulo: textoNoIdioma(skc.skcTitle, "title") || skc.supplierCode || skc.skcName,
        sku: sku.trim().slice(0, 60),
        ...resumirSkc(skc),
      });
    }
  }
  return lista;
}

const situacaoAnuncio = (skc: SkcShein) => (String(skc.skcShelfStatus) === "1" ? ("ativo" as const) : ("pausado" as const));

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

export async function importarShein(conexaoId: string): Promise<ResultadoImportacao> {
  const db = obterDb();
  const [conexao] = await db.select().from(conexoesCanal).where(eq(conexoesCanal.id, conexaoId));
  if (!conexao) throw new Error("conexão não encontrada");
  const contaId = conexao.contaId;
  const conta = conexao.apelido ?? "Shein";

  const { lista: spus } = await comChaves(conexaoId, produtos);
  const itens = resumir(spus);
  const total = itens.length; // anúncios = cores (SKC) dos produtos lidos
  if (!itens.length) return { conta, novos: 0, atualizados: 0, total: 0, deFora: 0 };

  const existentes = new Map<string, { anuncioId: string; pecaId: string; contaId: string }>();
  for (const lote of emLotes(itens.map((r) => r.idExterno), 500)) {
    const linhas = await db
      .select({ idExterno: anuncios.idExterno, anuncioId: anuncios.id, pecaId: anuncios.pecaId, contaId: anuncios.contaId })
      .from(anuncios)
      .where(sql`${anuncios.canal} = 'shein' and ${inArray(anuncios.idExterno, lote)}`);
    for (const l of linhas) existentes.set(l.idExterno!, l);
  }
  const daConta = itens.filter((r) => {
    const e = existentes.get(r.idExterno);
    return !e || e.contaId === contaId;
  });
  const novos = daConta.filter((r) => !existentes.has(r.idExterno));
  const velhos = daConta.filter((r) => existentes.has(r.idExterno));

  // ---- novos: liga à peça de mesmo SKU que ainda não está na Shein; senão cria a peça ----
  if (novos.length) {
    const semShein = await db
      .select({ id: pecas.id, sku: pecas.sku })
      .from(pecas)
      .leftJoin(anuncios, and(eq(anuncios.pecaId, pecas.id), eq(anuncios.canal, "shein")))
      .where(and(eq(pecas.contaId, contaId), isNull(anuncios.id)));
    const porSku = new Map(semShein.map((p) => [p.sku.toLowerCase(), p.id]));
    const usados = new Set(
      (await db.select({ sku: pecas.sku }).from(pecas).where(eq(pecas.contaId, contaId))).map((p) => p.sku.toLowerCase()),
    );

    const pecaDe = new Map<string, string>();
    const criar: { r: Resumo; sku: string }[] = [];
    for (const r of novos) {
      const ligada = r.sku ? porSku.get(r.sku.toLowerCase()) : undefined;
      if (ligada) {
        pecaDe.set(r.idExterno, ligada);
        porSku.delete(r.sku.toLowerCase()); // um anúncio da Shein por peça
        continue;
      }
      // SKU do vendedor; sem ele, SH + código do SKC. Repetido na conta ganha o SKC no fim.
      let sku = r.sku || `SH${r.skc.skcName}`;
      if (usados.has(sku.toLowerCase())) sku = `${r.sku}-${r.skc.skcName}`;
      usados.add(sku.toLowerCase());
      criar.push({ r, sku: sku.slice(0, 80) });
    }

    for (const lote of emLotes(criar, 100)) {
      const criadas = await db
        .insert(pecas)
        .values(
          lote.map(({ r, sku }) => ({
            contaId,
            sku,
            titulo: r.titulo,
            precoCentavos: r.precoCentavos,
            quantidade: r.quantidade,
            atributos: { shein_categoria: String(r.spu.categoryId ?? "") },
            situacao: "disponivel" as const,
          })),
        )
        .returning({ id: pecas.id });
      lote.forEach(({ r }, n) => pecaDe.set(r.idExterno, criadas[n].id));
      const linhasFotos = lote.flatMap(({ r }, n) => (r.skc.skcMainPicUrl ? [{ pecaId: criadas[n].id, url: r.skc.skcMainPicUrl, ordem: 0 }] : []));
      if (linhasFotos.length) await db.insert(fotosPeca).values(linhasFotos);
    }

    const agora = new Date();
    for (const lote of emLotes(novos, 200)) {
      await db.insert(anuncios).values(
        lote.map((r) => ({
          contaId,
          pecaId: pecaDe.get(r.idExterno)!,
          conexaoId,
          canal: "shein" as const,
          idExterno: r.idExterno,
          titulo: r.titulo,
          precoCentavos: r.precoCentavos,
          situacao: situacaoAnuncio(r.skc),
          publicadoEm: agora,
        })),
      );
    }
  }

  // ---- já importados: um UPDATE ... FROM (VALUES ...) por lote ----
  for (const lote of emLotes(velhos, 200)) {
    const valoresAnuncio: SQL[] = lote.map((r) => {
      const e = existentes.get(r.idExterno)!;
      return sql`(${e.anuncioId}::uuid, ${r.titulo}, ${r.precoCentavos}::int, ${situacaoAnuncio(r.skc)}::situacao_anuncio)`;
    });
    await db.execute(sql`
      update anuncios a set titulo = v.titulo, preco_centavos = v.preco, situacao = v.situacao,
        conexao_id = ${conexaoId}::uuid, atualizado_em = now()
      from (values ${sql.join(valoresAnuncio, sql`, `)}) as v(id, titulo, preco, situacao)
      where a.id = v.id`);

    // só a quantidade da peça acompanha a Shein (como na Shopee)
    const valoresPeca: SQL[] = lote.map((r) => sql`(${existentes.get(r.idExterno)!.pecaId}::uuid, ${r.quantidade}::int)`);
    await db.execute(sql`
      update pecas p set quantidade = v.quantidade, atualizado_em = now()
      from (values ${sql.join(valoresPeca, sql`, `)}) as v(id, quantidade)
      where p.id = v.id and p.situacao in ('rascunho', 'disponivel')`);
  }

  return { conta, novos: novos.length, atualizados: velhos.length, total, deFora: total - daConta.length };
}
