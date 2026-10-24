// Criar anúncio na Shein a partir de uma peça do Plist: categoria, ficha, cor e tamanho, fotos e publicação.
// A Shein analisa todo produto novo antes de pôr na vitrine: o anúncio nasce "publicando" e vira ativo
// quando a próxima sincronização do Inventário encontrar a cor na vitrine.
// Campos montados a partir dos clientes abertos e dos nomes da documentação (snake_case nesta parte da API);
// o retorno de erro da Shein (pre_valid_result) aparece para o lojista como veio.
import { CAMINHOS_SHEIN, chamarShein, ErroShein, type ChavesShein } from "@/lib/shein";

export type CategoriaShein = { id: number; tipo: number; nome: string };
export type AtributoShein = { id: number; nome: string; valores: { id: number; nome: string }[]; livre: boolean };
export type FichaShein = { obrigatorios: AtributoShein[]; cor: AtributoShein | null; tamanho: AtributoShein | null; marcas: { codigo: string; nome: string }[] };

type No = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v)) || 0;
const txt = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function lista(info: unknown, ...nomes: string[]): No[] {
  if (Array.isArray(info)) return info as No[];
  const o = (info ?? {}) as No;
  for (const n of nomes) if (Array.isArray(o[n])) return o[n] as No[];
  return [];
}

// Árvore de categorias da loja, só as finais (é nelas que se publica), com o caminho inteiro no nome.
async function folhas(chaves: ChavesShein): Promise<CategoriaShein[]> {
  const info = await chamarShein<unknown>(CAMINHOS_SHEIN.categorias, chaves, { json: {} });
  const saida: CategoriaShein[] = [];
  const andar = (nos: No[], caminho: string[]) => {
    for (const n of nos) {
      const nome = txt(n.category_name ?? n.categoryName);
      const filhos = lista(n.children ?? n.child_list ?? n.childList);
      if (filhos.length) andar(filhos, [...caminho, nome]);
      else if (n.last_category !== false) {
        saida.push({ id: num(n.category_id ?? n.categoryId), tipo: num(n.product_type_id ?? n.productTypeId), nome: [...caminho, nome].join(" › ") });
      }
    }
  };
  andar(lista(info, "data", "list", "category_list"), []);
  return saida.filter((c) => c.id && c.tipo);
}

// Busca por palavras do título (todas precisam aparecer no caminho da categoria).
export async function buscarCategoriasShein(chaves: ChavesShein, busca: string): Promise<CategoriaShein[]> {
  const palavras = normal(busca).split(/\s+/).filter((p) => p.length > 2);
  if (!palavras.length) return [];
  const todas = await folhas(chaves);
  const pontos = (c: CategoriaShein) => palavras.filter((p) => normal(c.nome).includes(p)).length;
  return todas
    .map((c) => ({ c, p: pontos(c) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.c.nome.length - b.c.nome.length)
    .slice(0, 12)
    .map((x) => x.c);
}

// Ficha do tipo de produto. Na Shein: attribute_type 1 = atributo de venda (attribute_label 1 é o principal,
// a cor, que vai no SKC; o outro é o tamanho, no SKU); attribute_status 3 = obrigatório.
export async function fichaShein(chaves: ChavesShein, tipo: number): Promise<FichaShein> {
  const info = await chamarShein<unknown>(CAMINHOS_SHEIN.atributos, chaves, { json: { product_type_id_list: [tipo] } });
  const bloco = lista(info, "data", "list")[0] ?? {};
  const brutos = lista(bloco.attribute_infos ?? bloco.attribute_info_list ?? info);
  const atributo = (a: No): AtributoShein => ({
    id: num(a.attribute_id),
    nome: txt(a.attribute_name) || String(a.attribute_id),
    valores: lista(a.attribute_value_info_list ?? a.attribute_value_list).map((v) => ({ id: num(v.attribute_value_id), nome: txt(v.attribute_value) })),
    livre: num(a.attribute_mode) === 1 || !lista(a.attribute_value_info_list ?? a.attribute_value_list).length,
  });
  const venda = brutos.filter((a) => num(a.attribute_type) === 1);
  const principal = venda.find((a) => num(a.attribute_label) === 1) ?? venda[0];
  const secundario = venda.find((a) => a !== principal);

  let marcas: { codigo: string; nome: string }[] = [];
  try {
    const m = await chamarShein<unknown>(CAMINHOS_SHEIN.marcas, chaves, { json: {} });
    marcas = lista(m, "data", "list").map((b) => ({ codigo: txt(b.brand_code), nome: txt(b.brand_name) })).filter((b) => b.codigo);
  } catch {
    // marca é opcional na maior parte das lojas: sem a lista, publica sem marca
  }
  return {
    obrigatorios: brutos.filter((a) => num(a.attribute_type) !== 1 && num(a.attribute_status) === 3).map(atributo),
    cor: principal ? atributo(principal) : null,
    tamanho: secundario ? atributo(secundario) : null,
    marcas,
  };
}

// Sites (país) e moeda em que a loja vende. Para a loja brasileira, normalmente shein-br em BRL.
async function sitesDaLoja(chaves: ChavesShein): Promise<{ main_site: string; sub_site_list: string[]; moeda: string }[]> {
  const info = await chamarShein<unknown>(CAMINHOS_SHEIN.sites, chaves, { json: {} });
  return lista(info, "data", "list")
    .map((s) => {
      const subs = lista(s.site_detail_list ?? s.sub_site_list);
      return {
        main_site: txt(s.main_site),
        sub_site_list: subs.map((x) => txt(x.site_abbr ?? x.sub_site)).filter(Boolean),
        moeda: txt(subs[0]?.currency ?? s.currency) || "BRL",
      };
    })
    .filter((s) => s.main_site && s.sub_site_list.length);
}

// A Shein só aceita fotos no endereço dela: transform-pic copia a foto de um endereço público.
// Tipo 1 = foto principal, 2 = detalhe.
async function copiarFoto(chaves: ChavesShein, url: string, tipo: 1 | 2): Promise<string> {
  const info = await chamarShein<No | null>(CAMINHOS_SHEIN.foto, chaves, { json: { image_type: tipo, original_url: url } });
  const nova = txt(info?.transformed ?? info?.transformed_url ?? info?.image_url ?? info?.url);
  if (!nova.startsWith("http")) throw new ErroShein(502, "foto_recusada", "A Shein não aceitou uma das fotos (ela pede de 900 a 2200 px e até 3 MB).");
  return nova;
}

export type NovoProdutoShein = {
  titulo: string;
  descricao: string;
  categoria: { id: number; tipo: number };
  sku: string;
  precoCentavos: number;
  quantidade: number;
  pesoGramas: number;
  dimensoes: { comprimento: number; largura: number; altura: number };
  fotos: string[]; // endereços públicos (os da peça)
  marca: string | null; // brand_code
  cor: { attribute_id: number; attribute_value_id: number };
  tamanho: { attribute_id: number; attribute_value_id: number } | null;
  atributos: { attribute_id: number; attribute_value_id?: number; attribute_extra_value?: string }[];
};

export async function publicarProdutoShein(chaves: ChavesShein, n: NovoProdutoShein): Promise<{ spu: string; skc: string }> {
  const sites = await sitesDaLoja(chaves);
  if (!sites.length) throw new ErroShein(409, "sem_site", "A Shein não informou em que país a loja vende.");
  const imagens: { image_type: number; image_sort: number; image_url: string }[] = [];
  for (const [i, url] of n.fotos.entries()) {
    imagens.push({ image_type: i === 0 ? 1 : 2, image_sort: i + 1, image_url: await copiarFoto(chaves, url, i === 0 ? 1 : 2) });
  }

  const info = await chamarShein<No | null>(CAMINHOS_SHEIN.publicar, chaves, {
    json: {
      source_system: "openapi",
      category_id: n.categoria.id,
      product_type_id: n.categoria.tipo,
      supplier_code: n.sku,
      ...(n.marca ? { brand_code: n.marca } : {}),
      site_list: sites.map((s) => ({ main_site: s.main_site, sub_site_list: s.sub_site_list })),
      multi_language_name_list: [{ language: "pt-br", name: n.titulo }],
      multi_language_desc_list: [{ language: "pt-br", name: n.descricao }],
      product_attribute_list: n.atributos,
      skc_list: [
        {
          supplier_code: n.sku,
          sale_attribute: n.cor,
          image_info: { image_info_list: imagens },
          sku_list: [
            {
              supplier_sku: n.sku,
              mall_state: 1, // à venda
              stop_purchase: 1,
              weight: n.pesoGramas,
              length: n.dimensoes.comprimento,
              width: n.dimensoes.largura,
              height: n.dimensoes.altura,
              ...(n.tamanho ? { sale_attribute_list: [n.tamanho] } : {}),
              price_info_list: sites.flatMap((s) => s.sub_site_list.map((sub) => ({ currency: s.moeda, base_price: n.precoCentavos / 100, sub_site: sub }))),
              stock_info_list: [{ inventory_num: n.quantidade }],
            },
          ],
        },
      ],
    },
  });

  // a Shein devolve os problemas do cadastro em pre_valid_result, com sucesso = false
  if (info && info.success === false) {
    const msgs = lista(info.pre_valid_result)
      .flatMap((r) => (Array.isArray(r.messages) ? (r.messages as unknown[]).map(txt) : [txt(r.message ?? r.form_name)]))
      .filter(Boolean);
    throw new ErroShein(400, "recusado", msgs.slice(0, 3).join(" · ") || "A Shein recusou o cadastro.");
  }
  const spu = txt(info?.spu_name);
  const skc = txt(lista(info?.skc_list)[0]?.skc_name);
  if (!spu || !skc) throw new ErroShein(502, "sem_produto", "A Shein não devolveu o produto criado.");
  return { spu, skc };
}
