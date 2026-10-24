"use server";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, fotosPeca, pecas } from "@/db/schema";
import { contaAtual } from "@/lib/conta";
import { proximoSku } from "@/lib/sku";
import { contaAmazonValida, ErroAmazon } from "@/lib/amazon";
import { idAnuncioAmazon, urlAmazon } from "@/lib/amazon-importar";
import {
  buscarCatalogo,
  camposDoTipo,
  estimarTaxaAmazon,
  publicarNaAmazonApi,
  sugerirTiposAmazon,
  type CampoAmazon,
  type NovaOfertaAmazon,
  type ProdutoCatalogo,
  type TipoProduto,
} from "@/lib/amazon-anuncio";

const MAX_FOTOS = 9; // principal + 8 da Amazon

function mensagem(e: unknown): string {
  if (!(e instanceof ErroAmazon)) return "Não deu para falar com a Amazon agora. Tente de novo.";
  if (e.codigo === "reconectar") return "A autorização da Amazon venceu. Reconecte em Canais.";
  if (e.codigo === "muitas_chamadas") return "A Amazon pediu para esperar um pouco. Tente de novo em um minuto.";
  return e.message;
}

// conta da Amazon da conta de quem está usando; null se não for dela
async function contaDaConta(conexaoId: string) {
  const atual = await contaAtual();
  if (!atual) return null;
  const [c] = await obterDb()
    .select({ id: conexoesCanal.id })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.id, conexaoId), eq(conexoesCanal.contaId, atual.conta.id), eq(conexoesCanal.canal, "amazon")));
  return c ? { conexaoId: c.id, contaId: atual.conta.id } : null;
}

export async function procurar(conexaoId: string, termo: string): Promise<{ produtos?: ProdutoCatalogo[]; erro?: string }> {
  const dono = await contaDaConta(conexaoId);
  if (!dono) return { erro: "Conecte a Amazon em Canais." };
  if (termo.trim().length < 3) return { produtos: [] };
  try {
    return { produtos: await buscarCatalogo((await contaAmazonValida(dono.conexaoId)).token, termo.trim()) };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

export async function tipos(conexaoId: string, titulo: string): Promise<{ tipos?: TipoProduto[]; erro?: string }> {
  const dono = await contaDaConta(conexaoId);
  if (!dono) return { erro: "Conecte a Amazon em Canais." };
  if (titulo.trim().length < 3) return { tipos: [] };
  try {
    return { tipos: await sugerirTiposAmazon((await contaAmazonValida(dono.conexaoId)).token, titulo.trim()) };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

export async function campos(conexaoId: string, tipo: string): Promise<{ campos?: CampoAmazon[]; erro?: string }> {
  const dono = await contaDaConta(conexaoId);
  if (!dono) return { erro: "Conecte a Amazon em Canais." };
  if (!/^[A-Z0-9_]{2,80}$/.test(tipo)) return { erro: "Tipo de produto inválido." };
  try {
    const { token, vendedorId } = await contaAmazonValida(dono.conexaoId);
    return { campos: await camposDoTipo(token, vendedorId, tipo) };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

export type EstadoAmazon = { erro?: string; feito?: { link: string | null; titulo: string; sku: string } };

const texto = (f: FormData, nome: string, max = 200) => String(f.get(nome) ?? "").trim().slice(0, max);
const inteiro = (f: FormData, nome: string) => Number.parseInt(texto(f, nome, 10), 10) || 0;
const centavos = (v: string) => {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

const CONDICOES = ["nova_com_etiqueta", "nova_sem_etiqueta", "seminova", "usada_bom_estado", "usada_com_detalhes"] as const;
type Condicao = (typeof CONDICOES)[number];
// condição da peça → conditionType da Amazon
const NA_AMAZON: Record<Condicao, string> = {
  nova_com_etiqueta: "new_new",
  nova_sem_etiqueta: "new_new",
  seminova: "used_like_new",
  usada_bom_estado: "used_very_good",
  usada_com_detalhes: "used_acceptable",
};

// Publica na Amazon. Modo "oferta": vende num ASIN do catálogo. Modo "produto": cria o produto
// com as fotos da peça. Só grava no Plist o que a Amazon aceitar.
export async function publicarNaAmazon(_: EstadoAmazon, f: FormData): Promise<EstadoAmazon> {
  const dono = await contaDaConta(texto(f, "conexao", 40));
  if (!dono) return { erro: "Conecte a Amazon em Canais para publicar." };
  const db = obterDb();

  const pecaId = texto(f, "peca", 40);
  const [peca] = pecaId ? await db.select().from(pecas).where(and(eq(pecas.id, pecaId), eq(pecas.contaId, dono.contaId))) : [];
  if (pecaId && !peca) return { erro: "Peça não encontrada." };
  if (peca) {
    const [ja] = await db.select({ id: anuncios.id }).from(anuncios).where(and(eq(anuncios.pecaId, peca.id), eq(anuncios.canal, "amazon")));
    if (ja) return { erro: "Esta peça já tem anúncio na Amazon." };
  }

  const modo = texto(f, "modo", 10) === "produto" ? "produto" : "oferta";
  const asin = texto(f, "asin", 12).toUpperCase();
  const tipo = texto(f, "tipo", 80);
  const titulo = texto(f, "titulo", 200).replace(/\s+/g, " ");
  const precoCentavos = centavos(texto(f, "preco", 20));
  const custoCentavos = centavos(texto(f, "custo", 20));
  const quantidade = Math.max(1, Math.min(9999, inteiro(f, "quantidade") || 1));
  const condicaoNova = (CONDICOES as readonly string[]).includes(texto(f, "condicao")) ? (texto(f, "condicao") as Condicao) : null;
  const condicao = peca?.condicao ?? condicaoNova;
  const notaCondicao = texto(f, "nota", 1000);

  if (!precoCentavos) return { erro: "Coloque o preço." };
  if (!condicao) return { erro: "Escolha o estado da peça." };
  if (!/^[A-Z0-9_]{2,80}$/.test(tipo)) return { erro: modo === "oferta" ? "Escolha o produto no catálogo da Amazon." : "Escolha o tipo de produto." };
  if (modo === "oferta" && !/^[A-Z0-9]{10}$/.test(asin)) return { erro: "Escolha o produto no catálogo da Amazon." };
  if (modo === "produto" && !peca) return { erro: "Produto novo na Amazon só com uma peça do estoque (as fotos vêm dela)." };

  const sku = peca?.sku ?? (await proximoSku(dono.contaId));
  let envio: NovaOfertaAmazon;
  if (modo === "oferta") {
    envio = { modo, asin, tipo, sku, precoCentavos, quantidade, condicao: NA_AMAZON[condicao], notaCondicao };
  } else {
    const fotos = (await db.select({ url: fotosPeca.url }).from(fotosPeca).where(eq(fotosPeca.pecaId, peca!.id)).orderBy(asc(fotosPeca.ordem)))
      .map((x) => x.url)
      .filter((u) => u.startsWith("https://"))
      .slice(0, MAX_FOTOS);
    if (!fotos.length) return { erro: "A peça não tem foto. A Amazon pede pelo menos uma." };
    const pesoGramas = inteiro(f, "peso");
    const dimensoes = { comprimento: inteiro(f, "comprimento"), largura: inteiro(f, "largura"), altura: inteiro(f, "altura") };
    if (titulo.length < 3) return { erro: "Escreva o título do anúncio." };
    if (pesoGramas <= 0) return { erro: "Coloque o peso com a embalagem." };
    if (Object.values(dimensoes).some((d) => d <= 0)) return { erro: "Coloque as medidas do pacote." };
    const ean = texto(f, "ean", 14).replace(/\D/g, "");
    if (ean && ![8, 12, 13, 14].includes(ean.length)) return { erro: "O código de barras (EAN) tem 8, 12, 13 ou 14 dígitos." };

    // ficha: amz_<atributo> = valor; unidade em amzu_<atributo>; o formulário diz se o campo leva idioma, número ou sim/não
    const extras: Extract<NovaOfertaAmazon, { modo: "produto" }>["extras"] = [];
    for (const [k, v] of f.entries()) {
      if (!k.startsWith("amz_") || typeof v !== "string" || !v.trim()) continue;
      const nome = k.slice(4);
      if (!/^[a-z0-9_]{1,80}$/.test(nome)) continue;
      const jeito = texto(f, `amzt_${nome}`, 20);
      extras.push({
        nome,
        valor: v.trim().slice(0, 500),
        unidade: texto(f, `amzu_${nome}`, 40) || undefined,
        idioma: jeito.includes("idioma"),
        numero: jeito.includes("numero"),
        simnao: jeito.includes("simnao"),
      });
    }
    envio = {
      modo,
      tipo,
      sku,
      precoCentavos,
      quantidade,
      condicao: NA_AMAZON[condicao],
      notaCondicao,
      titulo,
      marca: texto(f, "marca", 80) || peca!.marca || "",
      descricao: texto(f, "descricao", 2000) || peca!.descricao || "",
      ean: ean || undefined,
      fotos,
      pesoGramas,
      dimensoes,
      extras,
    };
  }

  let taxa: number | null = null;
  let vendedorId: string;
  try {
    const conta = await contaAmazonValida(dono.conexaoId);
    vendedorId = conta.vendedorId;
    await publicarNaAmazonApi(conta.token, vendedorId, envio);
    if (envio.modo === "oferta") taxa = await estimarTaxaAmazon(conta.token, envio.asin, precoCentavos);
  } catch (e) {
    console.error("publicar na Amazon falhou:", e instanceof ErroAmazon ? e.codigo : e);
    return { erro: `A Amazon recusou o anúncio: ${mensagem(e)}` };
  }

  const link = envio.modo === "oferta" ? urlAmazon(envio.asin) : null;
  const tituloAnuncio = envio.modo === "produto" ? envio.titulo : titulo || peca?.titulo || sku;
  let idDaPeca: string;
  if (peca) {
    idDaPeca = peca.id;
    await db
      .update(pecas)
      .set({
        ...(envio.modo === "produto"
          ? {
              pesoGramas: peca.pesoGramas ?? envio.pesoGramas,
              comprimentoCm: peca.comprimentoCm ?? envio.dimensoes.comprimento,
              larguraCm: peca.larguraCm ?? envio.dimensoes.largura,
              alturaCm: peca.alturaCm ?? envio.dimensoes.altura,
            }
          : {}),
        situacao: peca.situacao === "rascunho" ? "disponivel" : peca.situacao,
      })
      .where(eq(pecas.id, peca.id));
  } else {
    // peça nova: oferta num produto do catálogo; a foto da peça é a do catálogo
    const [nova] = await db
      .insert(pecas)
      .values({
        contaId: dono.contaId,
        sku,
        titulo: tituloAnuncio,
        marca: texto(f, "marca", 80) || null,
        condicao,
        precoCentavos,
        custoCentavos,
        quantidade,
        atributos: { amazon_tipo_produto: tipo, amazon_asin: asin },
        situacao: "disponivel",
      })
      .returning({ id: pecas.id });
    idDaPeca = nova.id;
    const imagem = texto(f, "imagem", 500);
    if (imagem.startsWith("https://")) await db.insert(fotosPeca).values({ pecaId: nova.id, url: imagem, ordem: 0 });
  }
  await db.insert(anuncios).values({
    contaId: dono.contaId,
    pecaId: idDaPeca,
    conexaoId: dono.conexaoId,
    canal: "amazon",
    idExterno: idAnuncioAmazon(vendedorId, sku),
    url: link,
    titulo: tituloAnuncio,
    precoCentavos,
    taxaEstimadaCentavos: taxa,
    // a Amazon processa o envio em alguns minutos; a sincronização do Inventário traz a situação final
    situacao: "publicando",
    publicadoEm: new Date(),
  });

  revalidatePath("/estoque");
  return { feito: { link, titulo: tituloAnuncio, sku } };
}
