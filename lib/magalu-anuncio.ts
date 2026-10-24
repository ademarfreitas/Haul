// Criar anúncio na Magalu a partir de uma peça do Plist: SKU, depois preço e estoque no canal Magazine Luiza.
// Docs: developers.magalu.com/docs/apis/products/ref (POST /seller/v1/portfolios/skus, /prices, /stocks).
// A Magalu processa tudo depois (responde 202) e o SKU passa pela moderação dela antes de ir ao ar.
// ATENÇÃO: os nomes dos campos do corpo do SKU (imagens e medidas, principalmente) não estão legíveis na
// documentação pública e precisam ser conferidos no sandbox. Quando a Magalu recusa, o 422 traz os campos
// em details[], e o Plist mostra esses campos na mensagem de erro.
import { canalVendaMagalu, chamarMagalu, ErroMagalu } from "@/lib/magalu";

export type NovoSkuMagalu = {
  sku: string;
  titulo: string;
  descricao: string;
  marca: string;
  condicao: "NEW" | "USED";
  ean: string | null;
  precoCentavos: number;
  quantidade: number;
  pesoGramas: number;
  dimensoes: { comprimento: number; largura: number; altura: number };
  fotos: string[]; // endereços públicos (https)
};

// SKU da Magalu: até 32 caracteres, sem espaço nem barra (vai no caminho das chamadas de preço e estoque)
export const skuAceitoMagalu = (sku: string) => /^[A-Za-z0-9._-]{1,32}$/.test(sku);

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

// o SKU acabou de ser aceito (202) e pode ainda não existir para preço e estoque: tenta algumas vezes
async function insistir(f: () => Promise<unknown>) {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (e) {
      if (i >= 3 || !(e instanceof ErroMagalu) || ![404, 422, 423].includes(e.status)) throw e;
      await esperar(2000 * (i + 1));
    }
  }
}

export async function publicarSkuMagalu(accessToken: string, n: NovoSkuMagalu): Promise<{ precoEEstoque: boolean; erro?: string }> {
  const canal = { id: canalVendaMagalu() };
  await chamarMagalu("/seller/v1/portfolios/skus", accessToken, {
    metodo: "POST",
    json: {
      sku: n.sku,
      title: n.titulo,
      description: n.descricao,
      brand: n.marca,
      condition: n.condicao,
      origin: "nacional", // lojista com CNPJ do Brasil (FAQ de produtos)
      fulfillment: false,
      active: true,
      channels: [canal],
      identifiers: n.ean ? [{ type: "ean", value: n.ean }] : [],
      images: n.fotos.map((url) => ({ url })),
      dimensions: {
        height: { value: n.dimensoes.altura, unit: "cm" },
        width: { value: n.dimensoes.largura, unit: "cm" },
        length: { value: n.dimensoes.comprimento, unit: "cm" },
        weight: { value: n.pesoGramas, unit: "g" },
      },
    },
  });

  // preço "de" (list_price) e "por" (price) iguais: sem desconto
  try {
    await insistir(() =>
      chamarMagalu("/seller/v1/portfolios/prices", accessToken, {
        metodo: "POST",
        json: { sku: n.sku, channel: canal, price: n.precoCentavos, list_price: n.precoCentavos, normalizer: 100, currency: "BRL" },
      }),
    );
    await insistir(() =>
      chamarMagalu("/seller/v1/portfolios/stocks", accessToken, {
        metodo: "POST",
        json: { sku: n.sku, channel: canal, type: "AVAILABLE", quantity: n.quantidade },
      }),
    );
    return { precoEEstoque: true };
  } catch (e) {
    // o SKU já foi criado: o anúncio fica no Plist e o lojista ajusta preço/estoque no portal ou sincroniza depois
    return { precoEEstoque: false, erro: e instanceof ErroMagalu ? e.message : "a Magalu não respondeu" };
  }
}
