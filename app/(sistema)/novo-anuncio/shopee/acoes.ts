"use server";
import { and, eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, fotosPeca, pecas } from "@/db/schema";
import { contaAtual } from "@/lib/conta";
import { proximoSku } from "@/lib/sku";
import { enviarImagemShopee, ErroShopee, lojaValida } from "@/lib/shopee";
import { fichaShopee, publicarItemShopee, sugerirCategoriasShopee, type AtributoShopee, type CategoriaShopee } from "@/lib/shopee-anuncio";

const MAX_FOTOS = 9; // limite da Shopee por anúncio

function mensagem(e: unknown): string {
  if (!(e instanceof ErroShopee)) return "Não deu para falar com a Shopee agora. Tente de novo.";
  if (e.codigo === "reconectar") return "A autorização da Shopee venceu. Reconecte em Canais.";
  return e.message;
}

// loja da Shopee da conta de quem está usando; null se não for dela
async function lojaDaConta(conexaoId: string) {
  const atual = await contaAtual();
  if (!atual) return null;
  const [c] = await obterDb()
    .select({ id: conexoesCanal.id })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.id, conexaoId), eq(conexoesCanal.contaId, atual.conta.id), eq(conexoesCanal.canal, "shopee")));
  return c ? { conexaoId: c.id, contaId: atual.conta.id } : null;
}

export async function sugerir(conexaoId: string, titulo: string): Promise<{ categorias?: CategoriaShopee[]; erro?: string }> {
  const dono = await lojaDaConta(conexaoId);
  if (!dono) return { erro: "Conecte a Shopee em Canais." };
  if (titulo.trim().length < 3) return { categorias: [] };
  try {
    return { categorias: await sugerirCategoriasShopee(await lojaValida(dono.conexaoId), titulo.trim().slice(0, 120)) };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

export async function ficha(
  conexaoId: string,
  categoriaId: number,
): Promise<{ ficha?: { atributos: AtributoShopee[]; marcas: { id: number; nome: string }[]; pedeMarca: boolean }; erro?: string }> {
  const dono = await lojaDaConta(conexaoId);
  if (!dono) return { erro: "Conecte a Shopee em Canais." };
  if (!Number.isInteger(categoriaId) || categoriaId <= 0) return { erro: "Categoria inválida." };
  try {
    return { ficha: await fichaShopee(await lojaValida(dono.conexaoId), categoriaId) };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

export type EstadoShopee = { erro?: string; feito?: { link: string; titulo: string; sku: string } };

const texto = (f: FormData, nome: string, max = 200) => String(f.get(nome) ?? "").trim().slice(0, max);
const inteiro = (f: FormData, nome: string) => Number.parseInt(texto(f, nome, 10), 10) || 0;
const centavos = (v: string) => {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

const CONDICOES = ["nova_com_etiqueta", "nova_sem_etiqueta", "seminova", "usada_bom_estado", "usada_com_detalhes"] as const;
type Condicao = (typeof CONDICOES)[number];

// Publica na Shopee uma peça do estoque (campo "peca") ou uma peça nova, com fotos já enviadas para a
// Shopee (campo "fotos"). Só grava no Plist o que a Shopee aceitar.
export async function publicarNaShopee(_: EstadoShopee, f: FormData): Promise<EstadoShopee> {
  const dono = await lojaDaConta(texto(f, "conexao", 40));
  if (!dono) return { erro: "Conecte a Shopee em Canais para publicar." };
  const db = obterDb();

  const pecaId = texto(f, "peca", 40);
  const [peca] = pecaId ? await db.select().from(pecas).where(and(eq(pecas.id, pecaId), eq(pecas.contaId, dono.contaId))) : [];
  if (pecaId && !peca) return { erro: "Peça não encontrada." };
  if (peca) {
    const [ja] = await db.select({ id: anuncios.id }).from(anuncios).where(and(eq(anuncios.pecaId, peca.id), eq(anuncios.canal, "shopee")));
    if (ja) return { erro: "Esta peça já tem anúncio na Shopee." };
  }

  const titulo = texto(f, "titulo", 120).replace(/\s+/g, " ");
  const descricao = texto(f, "descricao", 5000);
  const precoCentavos = centavos(texto(f, "preco", 20));
  const custoCentavos = centavos(texto(f, "custo", 20));
  const quantidade = Math.max(1, Math.min(9999, inteiro(f, "quantidade") || 1));
  const categoriaId = inteiro(f, "categoria");
  const pesoGramas = inteiro(f, "peso");
  const dimensoes = { comprimento: inteiro(f, "comprimento"), largura: inteiro(f, "largura"), altura: inteiro(f, "altura") };
  const fretes = f.getAll("frete").map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
  const condicaoNova = (CONDICOES as readonly string[]).includes(texto(f, "condicao")) ? (texto(f, "condicao") as Condicao) : null;
  const condicao = peca ? peca.condicao : condicaoNova;

  if (titulo.length < 3) return { erro: "Escreva o título do anúncio." };
  if (!precoCentavos) return { erro: "Coloque o preço." };
  if (!categoriaId) return { erro: "Escolha a categoria da Shopee." };
  if (!peca && !condicao) return { erro: "Escolha o estado da peça." };
  if (pesoGramas <= 0) return { erro: "Coloque o peso com a embalagem." };
  if (Object.values(dimensoes).some((d) => d <= 0)) return { erro: "Coloque as medidas do pacote." };
  if (!fretes.length) return { erro: "Escolha pelo menos uma forma de envio." };

  // ficha: attr_<id> = "id:<value_id>" (lista) ou texto; unidade em unid_<id>
  const atributos: { attribute_id: number; attribute_value_list: { value_id: number; original_value_name?: string; value_unit?: string }[] }[] = [];
  for (const [k, v] of f.entries()) {
    if (!k.startsWith("attr_") || typeof v !== "string" || !v.trim()) continue;
    const id = Number(k.slice(5));
    if (!Number.isInteger(id)) continue;
    const unidade = texto(f, `unid_${id}`, 20) || undefined;
    atributos.push({
      attribute_id: id,
      attribute_value_list: [v.startsWith("id:") ? { value_id: Number(v.slice(3)) } : { value_id: 0, original_value_name: v.trim().slice(0, 255), value_unit: unidade }],
    });
  }
  const marcaId = inteiro(f, "marcaId");
  const marcaTexto = texto(f, "marca", 80);
  const marca = marcaId > 0 ? { id: marcaId, nome: marcaTexto } : { id: 0, nome: "NoBrand" };

  // peça nova: as fotos já estão na Shopee (vieram de /api/canais/shopee/fotos)
  let novas: { id: string; url: string }[] = [];
  if (!peca) {
    try {
      novas = (JSON.parse(texto(f, "fotos", 20_000) || "[]") as { id: string; url: string }[])
        .filter((x) => typeof x?.id === "string" && typeof x?.url === "string")
        .slice(0, MAX_FOTOS);
    } catch {
      novas = [];
    }
    if (!novas.length) return { erro: "A Shopee pede pelo menos uma foto." };
  }
  const urls = peca
    ? (await db.select({ url: fotosPeca.url }).from(fotosPeca).where(eq(fotosPeca.pecaId, peca.id)).orderBy(asc(fotosPeca.ordem)))
        .map((x) => x.url)
        .filter((u) => u.startsWith("https://"))
        .slice(0, MAX_FOTOS)
    : [];
  if (peca && !urls.length) return { erro: "A peça não tem foto. A Shopee pede pelo menos uma." };

  const sku = peca?.sku ?? (await proximoSku(dono.contaId));
  let itemId: number;
  let shopId: number;
  try {
    const loja = await lojaValida(dono.conexaoId);
    shopId = loja.shopId;
    // peça do estoque: as fotos dela (guardadas no ML ou na Shopee) sobem de novo para o espaço da Shopee
    const fotos: string[] = novas.map((x) => x.id);
    for (const [n, url] of urls.entries()) {
      const r = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
      if (!r?.ok) continue;
      fotos.push((await enviarImagemShopee(await r.blob(), `foto-${n + 1}.jpg`)).id);
    }
    if (!fotos.length) return { erro: "Não deu para copiar as fotos da peça para a Shopee. Tente de novo." };
    ({ itemId } = await publicarItemShopee(loja, {
      titulo,
      descricao: descricao || titulo,
      categoriaId,
      precoCentavos,
      quantidade,
      condicao: condicao?.startsWith("nova") ? "NEW" : "USED",
      sku,
      pesoGramas,
      dimensoes,
      fotos,
      marca,
      atributos,
      fretes,
    }));
  } catch (e) {
    console.error("publicar na Shopee falhou:", e instanceof ErroShopee ? e.codigo : e);
    return { erro: `A Shopee recusou o anúncio: ${mensagem(e)}` };
  }

  const link = `https://shopee.com.br/product/${shopId}/${itemId}`;
  let idDaPeca: string;
  if (peca) {
    idDaPeca = peca.id;
    // peso e medidas ficam na peça para o próximo canal
    await db
      .update(pecas)
      .set({
        pesoGramas: peca.pesoGramas ?? pesoGramas,
        comprimentoCm: peca.comprimentoCm ?? dimensoes.comprimento,
        larguraCm: peca.larguraCm ?? dimensoes.largura,
        alturaCm: peca.alturaCm ?? dimensoes.altura,
        situacao: peca.situacao === "rascunho" ? "disponivel" : peca.situacao,
      })
      .where(eq(pecas.id, peca.id));
  } else {
    const [nova] = await db
      .insert(pecas)
      .values({
        contaId: dono.contaId,
        sku,
        titulo,
        descricao: descricao || null,
        marca: marcaTexto || null,
        categoria: texto(f, "categoriaNome", 160) || null,
        condicao,
        precoCentavos,
        custoCentavos,
        quantidade,
        pesoGramas,
        comprimentoCm: dimensoes.comprimento,
        larguraCm: dimensoes.largura,
        alturaCm: dimensoes.altura,
        atributos: { shopee_categoria: String(categoriaId) },
        situacao: "disponivel",
      })
      .returning({ id: pecas.id });
    idDaPeca = nova.id;
    const comEndereco = novas.filter((x) => x.url.startsWith("https://"));
    if (comEndereco.length) await db.insert(fotosPeca).values(comEndereco.map((x, ordem) => ({ pecaId: nova.id, url: x.url, ordem })));
  }
  await db.insert(anuncios).values({
    contaId: dono.contaId,
    pecaId: idDaPeca,
    conexaoId: dono.conexaoId,
    canal: "shopee",
    idExterno: String(itemId),
    url: link,
    titulo,
    precoCentavos,
    situacao: "ativo",
    publicadoEm: new Date(),
  });

  revalidatePath("/estoque");
  return { feito: { link, titulo, sku } };
}
