// Criar anúncio na Shopee a partir de uma peça do Plist: categoria, ficha obrigatória, marca, frete, fotos e publicação.
// Docs: https://open.shopee.com/documents/v2/v2.product.add_item (e category_recommend, get_category,
//       get_attributes, get_brand_list), v2.logistics.get_channel_list, v2.media_space.upload_image
import { chamarShopee, ErroShopee } from "@/lib/shopee";

type Loja = { accessToken: string; shopId: number };

export type CategoriaShopee = { id: number; nome: string };
export type AtributoShopee = {
  id: number;
  nome: string;
  tipo: string; // DROP_DOWN, COMBO_BOX, TEXT_FILED, MULTIPLE_SELECT, MULTIPLE_SELECT_COMBO_BOX
  valores: { id: number; nome: string }[];
  unidade?: string;
};
export type FreteShopee = { id: number; nome: string };

type CategoriaBruta = { category_id: number; parent_category_id: number; display_category_name?: string; original_category_name?: string; has_children: boolean };

// Nome completo ("Moda Feminina › Vestidos") das categorias sugeridas para o título.
export async function sugerirCategoriasShopee(loja: Loja, titulo: string): Promise<CategoriaShopee[]> {
  const r = await chamarShopee<{ response?: { category_id?: number[] } }>("/api/v2/product/category_recommend", loja, {
    consulta: { item_name: titulo },
  });
  const ids = (r.response?.category_id ?? []).slice(0, 5);
  if (!ids.length) return [];
  const todas = await chamarShopee<{ response?: { category_list?: CategoriaBruta[] } }>("/api/v2/product/get_category", loja, {
    consulta: { language: "pt-br" },
  });
  const porId = new Map((todas.response?.category_list ?? []).map((c) => [c.category_id, c]));
  const nome = (id: number): string => {
    const partes: string[] = [];
    for (let c = porId.get(id); c && partes.length < 6; c = porId.get(c.parent_category_id)) {
      partes.unshift(c.display_category_name || c.original_category_name || String(c.category_id));
    }
    return partes.join(" › ") || String(id);
  };
  return ids.map((id) => ({ id, nome: nome(id) }));
}

type AtributoBruto = {
  attribute_id: number;
  display_attribute_name?: string;
  original_attribute_name?: string;
  is_mandatory: boolean;
  input_type?: string;
  attribute_unit?: string[];
  attribute_value_list?: { value_id: number; display_value_name?: string; original_value_name?: string }[];
};

type Marcas = {
  response?: {
    brand_list?: { brand_id: number; display_brand_name?: string; original_brand_name?: string }[];
    has_next_page?: boolean;
    next_offset?: number;
    is_mandatory?: boolean;
  };
};

const MAX_MARCAS = 500;

// Ficha que a categoria exige e as marcas aceitas nela.
export async function fichaShopee(loja: Loja, categoriaId: number) {
  const a = await chamarShopee<{ response?: { attribute_list?: AtributoBruto[] } }>("/api/v2/product/get_attributes", loja, {
    consulta: { category_id: categoriaId, language: "pt-br" },
  });
  const obrigatorios: AtributoShopee[] = (a.response?.attribute_list ?? [])
    .filter((x) => x.is_mandatory)
    .map((x) => ({
      id: x.attribute_id,
      nome: x.display_attribute_name || x.original_attribute_name || String(x.attribute_id),
      tipo: x.input_type ?? "TEXT_FILED",
      valores: (x.attribute_value_list ?? []).map((v) => ({ id: v.value_id, nome: v.display_value_name || v.original_value_name || String(v.value_id) })),
      unidade: x.attribute_unit?.[0],
    }));

  const marcas: { id: number; nome: string }[] = [];
  let pedeMarca = false;
  for (let offset = 0; marcas.length < MAX_MARCAS; ) {
    const m = await chamarShopee<Marcas>("/api/v2/product/get_brand_list", loja, {
      consulta: { category_id: categoriaId, status: 1, offset, page_size: 100, language: "pt-br" },
    });
    pedeMarca = !!m.response?.is_mandatory;
    marcas.push(...(m.response?.brand_list ?? []).map((b) => ({ id: b.brand_id, nome: b.display_brand_name || b.original_brand_name || "" })));
    if (!m.response?.has_next_page || m.response.next_offset == null) break;
    offset = m.response.next_offset;
  }
  return { atributos: obrigatorios, marcas, pedeMarca };
}

// Fretes ligados na loja (Shopee Xpress, Correios...). O anúncio precisa de pelo menos um.
export async function fretesShopee(loja: Loja): Promise<FreteShopee[]> {
  const r = await chamarShopee<{ response?: { logistics_channel_list?: { logistics_channel_id: number; logistics_channel_name: string; enabled: boolean; mask_channel_id?: number }[] } }>(
    "/api/v2/logistics/get_channel_list",
    loja,
  );
  return (r.response?.logistics_channel_list ?? [])
    // canal "mascarado" é agrupado num canal-pai: o anúncio usa o pai
    .filter((c) => c.enabled && !c.mask_channel_id)
    .map((c) => ({ id: c.logistics_channel_id, nome: c.logistics_channel_name }));
}

export type NovoItemShopee = {
  titulo: string;
  descricao: string;
  categoriaId: number;
  precoCentavos: number;
  quantidade: number;
  condicao: "NEW" | "USED";
  sku: string;
  pesoGramas: number;
  dimensoes: { comprimento: number; largura: number; altura: number };
  fotos: string[]; // image_id
  marca: { id: number; nome: string };
  atributos: { attribute_id: number; attribute_value_list: { value_id: number; original_value_name?: string; value_unit?: string }[] }[];
  fretes: number[];
};

export async function publicarItemShopee(loja: Loja, n: NovoItemShopee): Promise<{ itemId: number }> {
  const r = await chamarShopee<{ response?: { item_id?: number } }>("/api/v2/product/add_item", loja, {
    json: {
      item_name: n.titulo,
      description: n.descricao,
      category_id: n.categoriaId,
      original_price: n.precoCentavos / 100,
      seller_stock: [{ stock: n.quantidade }],
      item_status: "NORMAL",
      condition: n.condicao,
      item_sku: n.sku,
      weight: n.pesoGramas / 1000,
      dimension: { package_length: n.dimensoes.comprimento, package_width: n.dimensoes.largura, package_height: n.dimensoes.altura },
      image: { image_id_list: n.fotos },
      brand: { brand_id: n.marca.id, original_brand_name: n.marca.nome },
      attribute_list: n.atributos,
      logistic_info: n.fretes.map((id) => ({ logistic_id: id, enabled: true })),
    },
  });
  if (!r.response?.item_id) throw new ErroShopee(502, "sem_item", "A Shopee não devolveu o anúncio criado.");
  return { itemId: r.response.item_id };
}
