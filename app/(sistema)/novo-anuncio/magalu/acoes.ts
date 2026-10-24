"use server";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, fotosPeca, pecas } from "@/db/schema";
import { contaAtual } from "@/lib/conta";
import { ErroMagalu, idAnuncioMagalu, lojaMagaluValida } from "@/lib/magalu";
import { publicarSkuMagalu, skuAceitoMagalu } from "@/lib/magalu-anuncio";

const MAX_FOTOS = 10;

export type EstadoMagalu = { erro?: string; feito?: { titulo: string; sku: string; aviso?: string } };

const texto = (f: FormData, nome: string, max = 200) => String(f.get(nome) ?? "").trim().slice(0, max);
const inteiro = (f: FormData, nome: string) => Number.parseInt(texto(f, nome, 10), 10) || 0;
const centavos = (v: string) => {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

function mensagem(e: unknown): string {
  if (!(e instanceof ErroMagalu)) return "Não deu para falar com a Magalu agora. Tente de novo.";
  if (e.codigo === "reconectar") return "A autorização da Magalu venceu. Reconecte em Canais.";
  return e.message;
}

// Publica na Magalu uma peça do estoque, com as fotos dela (endereços públicos do ML ou da Shopee).
// Só grava no Plist o que a Magalu aceitar.
export async function publicarNaMagalu(_: EstadoMagalu, f: FormData): Promise<EstadoMagalu> {
  const atual = await contaAtual();
  if (!atual) return { erro: "Sua sessão terminou. Entre de novo." };
  const contaId = atual.conta.id;
  const db = obterDb();

  const [conexao] = await db
    .select({ id: conexoesCanal.id })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.id, texto(f, "conexao", 40)), eq(conexoesCanal.contaId, contaId), eq(conexoesCanal.canal, "magalu")));
  if (!conexao) return { erro: "Conecte a Magalu em Canais para publicar." };

  const [peca] = await db.select().from(pecas).where(and(eq(pecas.id, texto(f, "peca", 40)), eq(pecas.contaId, contaId)));
  if (!peca) return { erro: "Peça não encontrada." };
  const [ja] = await db.select({ id: anuncios.id }).from(anuncios).where(and(eq(anuncios.pecaId, peca.id), eq(anuncios.canal, "magalu")));
  if (ja) return { erro: "Esta peça já tem anúncio na Magalu." };
  if (!skuAceitoMagalu(peca.sku)) return { erro: `A Magalu aceita SKU de até 32 letras, números, ponto, hífen ou sublinhado. Mude o SKU "${peca.sku}" no Estoque antes.` };

  const titulo = texto(f, "titulo", 150).replace(/\s+/g, " ");
  const descricao = texto(f, "descricao", 5000);
  const marca = texto(f, "marca", 80);
  const ean = texto(f, "ean", 14).replace(/\D/g, "");
  const precoCentavos = centavos(texto(f, "preco", 20));
  const quantidade = Math.max(1, Math.min(9999, inteiro(f, "quantidade") || 1));
  const pesoGramas = inteiro(f, "peso");
  const dimensoes = { comprimento: inteiro(f, "comprimento"), largura: inteiro(f, "largura"), altura: inteiro(f, "altura") };

  if (titulo.length < 3) return { erro: "Escreva o título do anúncio." };
  if (descricao.length < 10) return { erro: "Escreva uma descrição: a Magalu pede." };
  if (!marca) return { erro: "Coloque a marca (sem marca, escreva o nome da sua loja)." };
  if (ean && ![8, 12, 13, 14].includes(ean.length)) return { erro: "O código de barras (EAN) tem 8, 12, 13 ou 14 números. Deixe em branco se não tiver." };
  if (!precoCentavos) return { erro: "Coloque o preço." };
  if (pesoGramas <= 0) return { erro: "Coloque o peso com a embalagem." };
  if (Object.values(dimensoes).some((d) => d <= 0)) return { erro: "Coloque as medidas do pacote." };

  const fotos = (await db.select({ url: fotosPeca.url }).from(fotosPeca).where(eq(fotosPeca.pecaId, peca.id)).orderBy(asc(fotosPeca.ordem)))
    .map((x) => x.url)
    .filter((u) => u.startsWith("https://"))
    .slice(0, MAX_FOTOS);
  if (!fotos.length) return { erro: "A peça não tem foto. A Magalu pede pelo menos uma." };

  let aviso: string | undefined;
  let tenant: string;
  try {
    const loja = await lojaMagaluValida(conexao.id);
    tenant = loja.tenant;
    const r = await publicarSkuMagalu(loja.accessToken, {
      sku: peca.sku,
      titulo,
      descricao,
      marca,
      condicao: peca.condicao?.startsWith("nova") ? "NEW" : "USED",
      ean: ean || null,
      precoCentavos,
      quantidade,
      pesoGramas,
      dimensoes,
      fotos,
    });
    if (!r.precoEEstoque) aviso = `O anúncio foi criado, mas a Magalu não aceitou preço ou estoque ainda (${r.erro}). Confira no Portal do Seller.`;
  } catch (e) {
    console.error("publicar na Magalu falhou:", e instanceof ErroMagalu ? e.codigo : e);
    return { erro: `A Magalu recusou o anúncio: ${mensagem(e)}` };
  }

  await db
    .update(pecas)
    .set({
      pesoGramas: peca.pesoGramas ?? pesoGramas,
      comprimentoCm: peca.comprimentoCm ?? dimensoes.comprimento,
      larguraCm: peca.larguraCm ?? dimensoes.largura,
      alturaCm: peca.alturaCm ?? dimensoes.altura,
      marca: peca.marca ?? marca,
      situacao: peca.situacao === "rascunho" ? "disponivel" : peca.situacao,
    })
    .where(eq(pecas.id, peca.id));
  // a Magalu modera antes de pôr no ar: fica "publicando" até a próxima sincronização dizer o contrário
  await db.insert(anuncios).values({
    contaId,
    pecaId: peca.id,
    conexaoId: conexao.id,
    canal: "magalu",
    idExterno: idAnuncioMagalu(tenant, peca.sku),
    titulo,
    precoCentavos,
    situacao: "publicando",
    ultimoErro: aviso ?? null,
    publicadoEm: new Date(),
  });

  revalidatePath("/estoque");
  return { feito: { titulo, sku: peca.sku, aviso } };
}
