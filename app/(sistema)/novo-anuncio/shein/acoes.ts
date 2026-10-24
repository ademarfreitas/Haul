"use server";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, fotosPeca, pecas } from "@/db/schema";
import { contaAtual } from "@/lib/conta";
import { comChaves, ErroShein } from "@/lib/shein";
import { buscarCategoriasShein, fichaShein, publicarProdutoShein, type CategoriaShein, type FichaShein } from "@/lib/shein-anuncio";
import { idAnuncioShein } from "@/lib/shein-importar";

const MAX_FOTOS = 10; // 1 principal + detalhes

function mensagem(e: unknown): string {
  if (!(e instanceof ErroShein)) return "Não deu para falar com a Shein agora. Tente de novo.";
  if (e.codigo === "reconectar") return "A Shein recusou as chaves da loja. Reconecte em Canais.";
  return e.message;
}

// loja da Shein da conta de quem está usando; null se não for dela
async function lojaDaConta(conexaoId: string) {
  const atual = await contaAtual();
  if (!atual) return null;
  const [c] = await obterDb()
    .select({ id: conexoesCanal.id })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.id, conexaoId), eq(conexoesCanal.contaId, atual.conta.id), eq(conexoesCanal.canal, "shein")));
  return c ? { conexaoId: c.id, contaId: atual.conta.id } : null;
}

export async function categorias(conexaoId: string, busca: string): Promise<{ categorias?: CategoriaShein[]; erro?: string }> {
  const dono = await lojaDaConta(conexaoId);
  if (!dono) return { erro: "Conecte a Shein em Canais." };
  try {
    return { categorias: await comChaves(dono.conexaoId, (c) => buscarCategoriasShein(c, busca.slice(0, 120))) };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

export async function ficha(conexaoId: string, tipo: number): Promise<{ ficha?: FichaShein; erro?: string }> {
  const dono = await lojaDaConta(conexaoId);
  if (!dono) return { erro: "Conecte a Shein em Canais." };
  if (!Number.isInteger(tipo) || tipo <= 0) return { erro: "Categoria inválida." };
  try {
    return { ficha: await comChaves(dono.conexaoId, (c) => fichaShein(c, tipo)) };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

export type EstadoShein = { erro?: string; feito?: { titulo: string; sku: string } };

const texto = (f: FormData, nome: string, max = 200) => String(f.get(nome) ?? "").trim().slice(0, max);
const inteiro = (f: FormData, nome: string) => Number.parseInt(texto(f, nome, 12), 10) || 0;
const centavos = (v: string) => {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

// Publica na Shein uma peça do estoque. Só grava no Plist o que a Shein aceitar; o anúncio fica
// "publicando" até a Shein aprovar (a sincronização do Inventário atualiza).
export async function publicarNaShein(_: EstadoShein, f: FormData): Promise<EstadoShein> {
  const dono = await lojaDaConta(texto(f, "conexao", 40));
  if (!dono) return { erro: "Conecte a Shein em Canais para publicar." };
  const db = obterDb();

  const [peca] = await db.select().from(pecas).where(and(eq(pecas.id, texto(f, "peca", 40)), eq(pecas.contaId, dono.contaId)));
  if (!peca) return { erro: "Peça não encontrada." };
  const [ja] = await db.select({ id: anuncios.id }).from(anuncios).where(and(eq(anuncios.pecaId, peca.id), eq(anuncios.canal, "shein")));
  if (ja) return { erro: "Esta peça já tem anúncio na Shein." };

  const titulo = texto(f, "titulo", 200).replace(/\s+/g, " ");
  const descricao = texto(f, "descricao", 5000);
  const precoCentavos = centavos(texto(f, "preco", 20));
  const quantidade = Math.max(1, Math.min(9999, inteiro(f, "quantidade") || 1));
  const categoria = { id: inteiro(f, "categoria"), tipo: inteiro(f, "tipo") };
  const pesoGramas = inteiro(f, "peso");
  const dimensoes = { comprimento: inteiro(f, "comprimento"), largura: inteiro(f, "largura"), altura: inteiro(f, "altura") };
  const cor = { attribute_id: inteiro(f, "corAtributo"), attribute_value_id: inteiro(f, "cor") };
  const tamanho = inteiro(f, "tamanhoAtributo") ? { attribute_id: inteiro(f, "tamanhoAtributo"), attribute_value_id: inteiro(f, "tamanho") } : null;

  if (titulo.length < 3) return { erro: "Escreva o título do anúncio." };
  if (!precoCentavos) return { erro: "Coloque o preço." };
  if (!categoria.id || !categoria.tipo) return { erro: "Escolha a categoria da Shein." };
  if (!cor.attribute_id || !cor.attribute_value_id) return { erro: "Escolha a cor (a Shein separa o anúncio por cor)." };
  if (tamanho && !tamanho.attribute_value_id) return { erro: "Escolha o tamanho." };
  if (pesoGramas <= 0) return { erro: "Coloque o peso com a embalagem." };
  if (Object.values(dimensoes).some((d) => d <= 0)) return { erro: "Coloque as medidas do pacote." };

  // ficha: attr_<id> = "id:<valor>" (lista) ou texto livre
  const atributos: { attribute_id: number; attribute_value_id?: number; attribute_extra_value?: string }[] = [];
  for (const [k, v] of f.entries()) {
    if (!k.startsWith("attr_") || typeof v !== "string" || !v.trim()) continue;
    const id = Number(k.slice(5));
    if (!Number.isInteger(id)) continue;
    atributos.push(v.startsWith("id:") ? { attribute_id: id, attribute_value_id: Number(v.slice(3)) } : { attribute_id: id, attribute_extra_value: v.trim().slice(0, 255) });
  }

  const fotos = (await db.select({ url: fotosPeca.url }).from(fotosPeca).where(eq(fotosPeca.pecaId, peca.id)).orderBy(asc(fotosPeca.ordem)))
    .map((x) => x.url)
    .filter((u) => u.startsWith("https://"))
    .slice(0, MAX_FOTOS);
  if (!fotos.length) return { erro: "A peça não tem foto. A Shein pede pelo menos uma." };

  let criado: { spu: string; skc: string };
  try {
    criado = await comChaves(dono.conexaoId, (chaves) =>
      publicarProdutoShein(chaves, {
        titulo,
        descricao: descricao || titulo,
        categoria,
        sku: peca.sku,
        precoCentavos,
        quantidade,
        pesoGramas,
        dimensoes,
        fotos,
        marca: texto(f, "marca", 60) || null,
        cor,
        tamanho,
        atributos,
      }),
    );
  } catch (e) {
    console.error("publicar na Shein falhou:", e instanceof ErroShein ? e.codigo : e);
    return { erro: `A Shein recusou o anúncio: ${mensagem(e)}` };
  }

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
  await db.insert(anuncios).values({
    contaId: dono.contaId,
    pecaId: peca.id,
    conexaoId: dono.conexaoId,
    canal: "shein",
    idExterno: idAnuncioShein(criado.spu, criado.skc),
    titulo,
    precoCentavos,
    situacao: "publicando", // em análise na Shein
    publicadoEm: new Date(),
  });

  revalidatePath("/estoque");
  return { feito: { titulo, sku: peca.sku } };
}
