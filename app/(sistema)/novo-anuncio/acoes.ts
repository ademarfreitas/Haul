"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, fotosPeca, pecas } from "@/db/schema";
import { contaAtual } from "@/lib/conta";
import { proximoSku } from "@/lib/sku";
import { ErroMl, tokenValido } from "@/lib/mercado-livre";
import {
  atributosObrigatorios,
  produtoPorGtin,
  publicarItem,
  sugerirCategorias,
  taxaEstimada,
  TIPOS_ANUNCIO,
  type Categoria,
  type TipoAnuncio,
} from "@/lib/ml-anuncio";

const CONDICOES = ["nova_com_etiqueta", "nova_sem_etiqueta", "seminova", "usada_bom_estado", "usada_com_detalhes"] as const;
type Condicao = (typeof CONDICOES)[number];

function mensagemMl(e: unknown): string {
  if (!(e instanceof ErroMl)) return "Não deu para falar com o Mercado Livre agora. Tente de novo.";
  if (e.codigo === "reconectar") return "A autorização do Mercado Livre venceu. Reconecte em Canais.";
  return e.causas.length ? e.causas.join(" ") : e.message;
}

// conexão do ML da conta de quem está usando; null se não for dela
async function conexaoDaConta(conexaoId: string) {
  const atual = await contaAtual();
  if (!atual) return null;
  const [c] = await obterDb()
    .select({ id: conexoesCanal.id })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.id, conexaoId), eq(conexoesCanal.contaId, atual.conta.id), eq(conexoesCanal.canal, "mercado_livre")));
  return c ? { conexaoId: c.id, contaId: atual.conta.id } : null;
}

export async function sugerir(conexaoId: string, titulo: string): Promise<{ categorias?: Categoria[]; erro?: string }> {
  const dono = await conexaoDaConta(conexaoId);
  if (!dono) return { erro: "Conecte o Mercado Livre em Canais." };
  if (titulo.trim().length < 3) return { categorias: [] };
  try {
    return { categorias: await sugerirCategorias(await tokenValido(dono.conexaoId), titulo.trim().slice(0, 120)) };
  } catch (e) {
    return { erro: mensagemMl(e) };
  }
}

export async function ficha(conexaoId: string, categoriaId: string) {
  const dono = await conexaoDaConta(conexaoId);
  if (!dono) return { erro: "Conecte o Mercado Livre em Canais." };
  try {
    return { ficha: await atributosObrigatorios(await tokenValido(dono.conexaoId), categoriaId) };
  } catch (e) {
    return { erro: mensagemMl(e) };
  }
}

export async function buscarCatalogo(conexaoId: string, gtin: string) {
  const dono = await conexaoDaConta(conexaoId);
  if (!dono) return { erro: "Conecte o Mercado Livre em Canais." };
  const codigo = gtin.replace(/\D/g, "");
  if (!/^\d{8,14}$/.test(codigo)) return { erro: "O código de barras tem de 8 a 14 números." };
  try {
    return { produto: await produtoPorGtin(await tokenValido(dono.conexaoId), codigo) };
  } catch (e) {
    return { erro: mensagemMl(e) };
  }
}

export type EstadoAnuncio = {
  erro?: string;
  causas?: string[];
  feito?: { pecaId: string; sku: string; publicado: boolean; link?: string | null; titulo: string };
};

const texto = (f: FormData, nome: string, max = 200) => String(f.get(nome) ?? "").trim().slice(0, max);
const centavos = (v: string) => {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

// "Salvar rascunho" grava só no Plist. "Publicar" manda para o ML primeiro e só grava se der certo,
// para uma tentativa que falhou não deixar peça repetida no estoque.
export async function salvarAnuncio(_: EstadoAnuncio, f: FormData): Promise<EstadoAnuncio> {
  const publicar = f.get("acao") === "publicar";
  const conexaoId = texto(f, "conexao", 40);
  const atual = await contaAtual();
  if (!atual) return { erro: "Sua sessão terminou. Entre de novo." };
  const contaId = atual.conta.id;

  const titulo = texto(f, "titulo").replace(/\s+/g, " ");
  const precoCentavos = centavos(texto(f, "preco", 20));
  const custoCentavos = centavos(texto(f, "custo", 20));
  const quantidade = Math.max(1, Math.min(9999, Number.parseInt(texto(f, "quantidade", 6), 10) || 1));
  const condicao = (CONDICOES as readonly string[]).includes(texto(f, "condicao")) ? (texto(f, "condicao") as Condicao) : null;
  const categoriaId = texto(f, "categoria", 20);
  const tipo = (Object.hasOwn(TIPOS_ANUNCIO, texto(f, "tipo", 20)) ? texto(f, "tipo", 20) : "gold_special") as TipoAnuncio;
  const marca = texto(f, "marca", 80);
  const cor = texto(f, "cor", 60);
  const tamanho = texto(f, "tamanho", 30);
  const ean = texto(f, "ean", 20).replace(/\D/g, "");
  const descricao = texto(f, "descricao", 50_000);
  let fotos: { id: string; url: string }[] = [];
  try {
    fotos = (JSON.parse(texto(f, "fotos", 20_000) || "[]") as { id: string; url: string }[])
      .filter((x) => typeof x?.id === "string" && typeof x?.url === "string" && x.url.startsWith("https://"))
      .slice(0, 10);
  } catch {
    fotos = [];
  }

  if (titulo.length < 3) return { erro: "Escreva o título do anúncio." };
  if (!precoCentavos) return { erro: "Coloque o preço." };

  // ficha técnica pedida pela categoria: campos attr_<ID> (lista → "id:<value_id>", texto → valor)
  const atributos: { id: string; value_id?: string; value_name?: string }[] = [];
  for (const [k, v] of f.entries()) {
    if (!k.startsWith("attr_") || typeof v !== "string" || !v.trim()) continue;
    const id = k.slice(5).replace(/[^A-Z0-9_]/g, "");
    atributos.push(v.startsWith("id:") ? { id, value_id: v.slice(3) } : { id, value_name: v.trim().slice(0, 255) });
  }
  if (marca) atributos.push({ id: "BRAND", value_name: marca });
  if (cor) atributos.push({ id: "COLOR", value_name: cor });
  if (tamanho) atributos.push({ id: "SIZE", value_name: tamanho });
  if (ean) atributos.push({ id: "GTIN", value_name: ean });
  else if (texto(f, "semGtin", 30)) atributos.push({ id: "EMPTY_GTIN_REASON", value_id: texto(f, "semGtin", 30) });

  const db = obterDb();
  // peça que já estava no estoque (nota ou planilha do fornecedor) e ainda não está no ML: atualiza em vez de criar
  const pecaId = texto(f, "peca", 40);
  const [existente] = /^[0-9a-f-]{36}$/.test(pecaId)
    ? await db
        .select({ id: pecas.id, sku: pecas.sku, atributos: pecas.atributos })
        .from(pecas)
        .leftJoin(anuncios, and(eq(anuncios.pecaId, pecas.id), eq(anuncios.canal, "mercado_livre")))
        .where(and(eq(pecas.id, pecaId), eq(pecas.contaId, contaId), isNull(anuncios.id)))
    : [];
  const sku = existente?.sku ?? (await proximoSku(contaId));
  atributos.push({ id: "SELLER_SKU", value_name: sku });

  let publicado: { id: string; permalink: string; status: string } | null = null;
  let taxa: number | null = null;
  let dono: Awaited<ReturnType<typeof conexaoDaConta>> = null;
  if (publicar) {
    dono = await conexaoDaConta(conexaoId);
    if (!dono) return { erro: "Conecte o Mercado Livre em Canais para publicar." };
    if (!categoriaId) return { erro: "Escolha a categoria do Mercado Livre." };
    if (!condicao) return { erro: "Escolha o estado da peça." };
    if (!fotos.length) return { erro: "O Mercado Livre pede pelo menos uma foto." };
    try {
      const token = await tokenValido(dono.conexaoId);
      taxa = await taxaEstimada(token, precoCentavos, categoriaId, tipo);
      publicado = await publicarItem(token, {
        titulo,
        categoriaId,
        precoCentavos,
        quantidade,
        condicao: condicao.startsWith("nova") ? "new" : "used",
        tipo,
        fotos: fotos.map((x) => x.id),
        atributos,
        descricao,
      });
    } catch (e) {
      console.error("publicar no ML falhou:", e instanceof ErroMl ? e.codigo : e);
      return { erro: "O Mercado Livre recusou o anúncio.", causas: [mensagemMl(e)] };
    }
  }

  const ficha: Record<string, string> = {};
  for (const a of atributos) ficha[a.id] = a.value_name ?? a.value_id ?? "";
  if (categoriaId) ficha.ml_categoria = categoriaId;
  const caixa = texto(f, "caixa", 30);
  if (caixa) ficha.caixa = caixa;

  const dados = {
    titulo,
    descricao: descricao || null,
    marca: marca || null,
    categoria: texto(f, "categoriaNome", 120) || null,
    tamanho: tamanho || null,
    cor: cor || null,
    condicao,
    precoCentavos,
    custoCentavos,
    quantidade,
    ean: ean || null,
  };
  let peca: { id: string };
  if (existente) {
    [peca] = await db
      .update(pecas)
      .set({ ...dados, atributos: { ...(existente.atributos ?? {}), ...ficha }, ...(publicado ? { situacao: "disponivel" as const } : {}) })
      .where(eq(pecas.id, existente.id))
      .returning({ id: pecas.id });
    if (fotos.length) await db.delete(fotosPeca).where(eq(fotosPeca.pecaId, existente.id));
  } else {
    [peca] = await db
      .insert(pecas)
      .values({ contaId, sku, ...dados, atributos: ficha, situacao: publicado ? "disponivel" : "rascunho" })
      .returning({ id: pecas.id });
  }
  if (fotos.length) await db.insert(fotosPeca).values(fotos.map((x, ordem) => ({ pecaId: peca.id, url: x.url, ordem })));
  if (publicado && dono) {
    await db.insert(anuncios).values({
      contaId,
      pecaId: peca.id,
      conexaoId: dono.conexaoId,
      canal: "mercado_livre",
      idExterno: publicado.id,
      url: publicado.permalink,
      titulo,
      precoCentavos,
      taxaEstimadaCentavos: taxa,
      situacao: publicado.status === "active" ? "ativo" : publicado.status === "paused" ? "pausado" : "publicando",
      publicadoEm: new Date(),
    });
  }

  revalidatePath("/estoque");
  return { feito: { pecaId: peca.id, sku, publicado: !!publicado, link: publicado?.permalink, titulo } };
}
