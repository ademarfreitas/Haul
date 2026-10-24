// Anunciar na Amazon a partir de uma peça do Plist. Dois caminhos:
// - o produto já existe no catálogo (ASIN): só a oferta (preço, quantidade, condição) — o mais comum;
// - produto novo: tipo de produto + ficha que o tipo exige (lida do JSON Schema da Amazon) + fotos públicas.
// Docs: Catalog Items 2022-04-01 (searchCatalogItems), Product Type Definitions 2020-09-01,
//       Listings Items 2021-08-01 (putListingsItem / patchListingsItem), Product Fees v0.
import { chamarAmazon, contaAmazonValida, ErroAmazon, MARKETPLACE_BR } from "@/lib/amazon";
import { skuDoAnuncio } from "@/lib/amazon-importar";

const IDIOMA = "pt_BR";

export type ProdutoCatalogo = { asin: string; titulo: string; marca: string | null; imagem: string | null; tipo: string | null };
export type TipoProduto = { nome: string; rotulo: string };
export type CampoAmazon = {
  nome: string;
  rotulo: string;
  ajuda?: string;
  tipo: "texto" | "numero" | "lista" | "simnao";
  opcoes?: { valor: string; rotulo: string }[];
  unidades?: string[];
  idioma: boolean;
};

type ItemCatalogo = {
  asin: string;
  summaries?: { marketplaceId: string; itemName?: string; brand?: string }[];
  images?: { marketplaceId: string; images?: { variant: string; link: string }[] }[];
  productTypes?: { marketplaceId: string; productType: string }[];
};

// Busca no catálogo da Amazon.com.br por EAN/GTIN (só dígitos) ou por palavras do título.
export async function buscarCatalogo(token: string, termo: string): Promise<ProdutoCatalogo[]> {
  const codigo = termo.replace(/\D/g, "");
  const porCodigo = /^\d{8,14}$/.test(termo.trim()) && codigo.length === termo.trim().length;
  const r = await chamarAmazon<{ items?: ItemCatalogo[] }>("/catalog/2022-04-01/items", token, {
    consulta: {
      marketplaceIds: MARKETPLACE_BR,
      includedData: "summaries,images,productTypes",
      pageSize: 10,
      locale: IDIOMA,
      ...(porCodigo ? { identifiers: codigo, identifiersType: codigo.length === 12 ? "UPC" : "EAN" } : { keywords: termo.slice(0, 200) }),
    },
  });
  return (r.items ?? []).map((i) => {
    const s = i.summaries?.find((x) => x.marketplaceId === MARKETPLACE_BR) ?? i.summaries?.[0];
    const fotos = (i.images?.find((x) => x.marketplaceId === MARKETPLACE_BR) ?? i.images?.[0])?.images ?? [];
    return {
      asin: i.asin,
      titulo: s?.itemName ?? i.asin,
      marca: s?.brand ?? null,
      imagem: (fotos.find((f) => f.variant === "MAIN") ?? fotos[0])?.link ?? null,
      tipo: (i.productTypes?.find((x) => x.marketplaceId === MARKETPLACE_BR) ?? i.productTypes?.[0])?.productType ?? null,
    };
  });
}

// Tipos de produto sugeridos pelo título (ex.: SHIRT, DRESS, SHOES).
export async function sugerirTiposAmazon(token: string, titulo: string): Promise<TipoProduto[]> {
  const r = await chamarAmazon<{ productTypes?: { name: string; displayName?: string }[] }>("/definitions/2020-09-01/productTypes", token, {
    consulta: { marketplaceIds: MARKETPLACE_BR, itemName: titulo.slice(0, 200), locale: IDIOMA, searchLocale: IDIOMA },
  });
  return (r.productTypes ?? []).slice(0, 6).map((t) => ({ nome: t.name, rotulo: t.displayName || t.name }));
}

// Atributos que o formulário do Plist já preenche sozinho (com os dados da peça).
const AUTOMATICOS = new Set([
  "item_name",
  "brand",
  "product_description",
  "condition_type",
  "condition_note",
  "purchasable_offer",
  "list_price",
  "fulfillment_availability",
  "merchant_suggested_asin",
  "externally_assigned_product_identifier",
  "supplier_declared_has_product_identifier_exemption",
  "main_product_image_locator",
  "item_package_weight",
  "item_package_dimensions",
  "skip_offer",
]);

type Esquema = {
  required?: string[];
  properties?: Record<
    string,
    {
      title?: string;
      description?: string;
      items?: {
        properties?: {
          value?: { type?: string; enum?: (string | number | boolean)[]; enumNames?: string[]; title?: string };
          unit?: { enum?: string[] };
          language_tag?: unknown;
        };
      };
    }
  >;
};

// Campos obrigatórios do tipo de produto que o lojista precisa responder. Os de estrutura complicada
// ficam de fora: se faltarem, a Amazon devolve o aviso e o Plist mostra.
export async function camposDoTipo(token: string, vendedorId: string, tipo: string): Promise<CampoAmazon[]> {
  const d = await chamarAmazon<{ schema?: { link?: { resource?: string } } }>(`/definitions/2020-09-01/productTypes/${encodeURIComponent(tipo)}`, token, {
    consulta: { marketplaceIds: MARKETPLACE_BR, sellerId: vendedorId, requirements: "LISTING", locale: IDIOMA },
  });
  const link = d.schema?.link?.resource;
  if (!link) throw new ErroAmazon(502, "sem_esquema", "A Amazon não mandou a ficha deste tipo de produto.");
  const r = await fetch(link, { cache: "no-store", signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!r?.ok) throw new ErroAmazon(503, "amazon_indisponivel", "Não deu para baixar a ficha do tipo de produto.");
  const esquema = (await r.json()) as Esquema;

  const campos: CampoAmazon[] = [];
  for (const nome of esquema.required ?? []) {
    if (AUTOMATICOS.has(nome)) continue;
    const p = esquema.properties?.[nome];
    const valor = p?.items?.properties?.value;
    if (!p || !valor) continue;
    const opcoes = valor.enum?.map((v, i) => ({ valor: String(v), rotulo: valor.enumNames?.[i] ?? String(v) }));
    campos.push({
      nome,
      rotulo: p.title || valor.title || nome,
      ajuda: p.description?.slice(0, 200),
      tipo: valor.type === "boolean" ? "simnao" : opcoes?.length ? "lista" : valor.type === "number" || valor.type === "integer" ? "numero" : "texto",
      opcoes,
      unidades: p.items?.properties?.unit?.enum,
      idioma: !!p.items?.properties?.language_tag,
    });
  }
  return campos;
}

export type NovaOfertaAmazon = {
  sku: string;
  precoCentavos: number;
  quantidade: number;
  condicao: string; // conditionType: new_new, used_good...
  notaCondicao?: string;
} & (
  | { modo: "oferta"; asin: string; tipo: string }
  | {
      modo: "produto";
      tipo: string;
      titulo: string;
      marca: string;
      descricao: string;
      ean?: string;
      fotos: string[]; // endereços públicos (https)
      pesoGramas: number;
      dimensoes: { comprimento: number; largura: number; altura: number };
      extras: { nome: string; valor: string; unidade?: string; idioma: boolean; numero: boolean; simnao: boolean }[];
    }
);

type Envio = { status?: string; issues?: { severity?: string; message?: string; attributeNames?: string[] }[] };

function emBr<T extends object>(v: T) {
  return [{ ...v, marketplace_id: MARKETPLACE_BR }];
}

function atributos(n: NovaOfertaAmazon): Record<string, unknown> {
  const preco = n.precoCentavos / 100;
  const a: Record<string, unknown> = {
    condition_type: emBr({ value: n.condicao }),
    purchasable_offer: emBr({ currency: "BRL", our_price: [{ schedule: [{ value_with_tax: preco }] }] }),
    fulfillment_availability: [{ fulfillment_channel_code: "DEFAULT", quantity: n.quantidade }],
  };
  if (n.notaCondicao && !n.condicao.startsWith("new")) a.condition_note = emBr({ value: n.notaCondicao, language_tag: IDIOMA });
  if (n.modo === "oferta") {
    a.merchant_suggested_asin = emBr({ value: n.asin });
    return a;
  }
  a.item_name = emBr({ value: n.titulo, language_tag: IDIOMA });
  a.brand = emBr({ value: n.marca || "Genérico", language_tag: IDIOMA });
  a.product_description = emBr({ value: n.descricao || n.titulo, language_tag: IDIOMA });
  a.list_price = emBr({ value: preco, currency: "BRL" });
  // sem EAN, a conta precisa da isenção de código (GTIN) aprovada pela Amazon para a marca/categoria
  if (n.ean) a.externally_assigned_product_identifier = emBr({ type: n.ean.length === 12 ? "upc" : "ean", value: n.ean });
  else a.supplier_declared_has_product_identifier_exemption = emBr({ value: true });
  a.main_product_image_locator = emBr({ media_location: n.fotos[0] });
  n.fotos.slice(1, 9).forEach((url, i) => (a[`other_product_image_locator_${i + 1}`] = emBr({ media_location: url })));
  a.item_package_weight = emBr({ value: n.pesoGramas, unit: "grams" });
  a.item_package_dimensions = emBr({
    length: { value: n.dimensoes.comprimento, unit: "centimeters" },
    width: { value: n.dimensoes.largura, unit: "centimeters" },
    height: { value: n.dimensoes.altura, unit: "centimeters" },
  });
  for (const x of n.extras) {
    const valor = x.simnao ? x.valor === "sim" : x.numero ? Number(x.valor.replace(",", ".")) : x.valor;
    a[x.nome] = emBr({ value: valor, ...(x.unidade ? { unit: x.unidade } : {}), ...(x.idioma ? { language_tag: IDIOMA } : {}) });
  }
  return a;
}

// Cria o anúncio. A Amazon aceita o envio e processa em seguida (alguns minutos): o anúncio nasce
// "publicando" no Plist e a próxima sincronização do Inventário traz a situação de verdade.
export async function publicarNaAmazonApi(token: string, vendedorId: string, n: NovaOfertaAmazon): Promise<void> {
  const r = await chamarAmazon<Envio>(`/listings/2021-08-01/items/${encodeURIComponent(vendedorId)}/${encodeURIComponent(n.sku)}`, token, {
    metodo: "PUT",
    consulta: { marketplaceIds: MARKETPLACE_BR, issueLocale: IDIOMA },
    json: { productType: n.tipo, requirements: n.modo === "oferta" ? "LISTING_OFFER_ONLY" : "LISTING", attributes: atributos(n) },
  });
  const erros = (r.issues ?? []).filter((i) => i.severity === "ERROR");
  if (r.status !== "ACCEPTED" || erros.length) {
    const texto = erros.map((i) => i.message).filter(Boolean).slice(0, 4).join(" · ");
    throw new ErroAmazon(400, "recusado", texto || "A Amazon recusou o anúncio.");
  }
}

// Taxa estimada (comissão + taxa de fechamento) para o preço, pelo ASIN. Melhor esforço: null se falhar.
export async function estimarTaxaAmazon(token: string, asin: string, precoCentavos: number): Promise<number | null> {
  try {
    const r = await chamarAmazon<{ payload?: { FeesEstimateResult?: { Status?: string; FeesEstimate?: { TotalFeesEstimate?: { Amount?: number } } } } }>(
      `/products/fees/v0/items/${encodeURIComponent(asin)}/feesEstimate`,
      token,
      {
        json: {
          FeesEstimateRequest: {
            MarketplaceId: MARKETPLACE_BR,
            IsAmazonFulfilled: false,
            PriceToEstimateFees: { ListingPrice: { CurrencyCode: "BRL", Amount: precoCentavos / 100 } },
            Identifier: `plist-${asin}-${precoCentavos}`,
          },
        },
      },
    );
    const total = r.payload?.FeesEstimateResult?.FeesEstimate?.TotalFeesEstimate?.Amount;
    return r.payload?.FeesEstimateResult?.Status === "Success" && total != null ? Math.round(total * 100) : null;
  } catch {
    return null;
  }
}

// Multivenda: põe a quantidade do anúncio (0 = sem estoque, sai da vitrine). Anúncio FBA não dá:
// o estoque está no centro da Amazon, e quem ajusta é o lojista no Seller Central.
export async function quantidadeNaAmazon(conexaoId: string, idExterno: string, quantidade: number): Promise<void> {
  const { token, vendedorId } = await contaAmazonValida(conexaoId);
  const sku = skuDoAnuncio(idExterno);
  const caminho = `/listings/2021-08-01/items/${encodeURIComponent(vendedorId)}/${encodeURIComponent(sku)}`;
  const atual = await chamarAmazon<{
    summaries?: { marketplaceId: string; productType: string }[];
    fulfillmentAvailability?: { fulfillmentChannelCode: string }[];
  }>(caminho, token, { consulta: { marketplaceIds: MARKETPLACE_BR, includedData: "summaries,fulfillmentAvailability" } });
  if ((atual.fulfillmentAvailability ?? []).some((f) => f.fulfillmentChannelCode !== "DEFAULT")) {
    throw new ErroAmazon(409, "fba", "o estoque está no FBA da Amazon, ajuste no Seller Central");
  }
  const tipo = (atual.summaries?.find((s) => s.marketplaceId === MARKETPLACE_BR) ?? atual.summaries?.[0])?.productType;
  if (!tipo) throw new ErroAmazon(404, "sem_anuncio", "a Amazon não achou o anúncio");
  const r = await chamarAmazon<Envio>(caminho, token, {
    metodo: "PATCH",
    consulta: { marketplaceIds: MARKETPLACE_BR, issueLocale: IDIOMA },
    json: {
      productType: tipo,
      patches: [{ op: "replace", path: "/attributes/fulfillment_availability", value: [{ fulfillment_channel_code: "DEFAULT", quantity: quantidade }] }],
    },
  });
  if (r.status !== "ACCEPTED") {
    throw new ErroAmazon(400, "recusado", r.issues?.find((i) => i.severity === "ERROR")?.message || "a Amazon recusou a mudança");
  }
}
