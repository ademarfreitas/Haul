// Multivenda: vendeu num canal, os anúncios da mesma peça nos outros canais acompanham.
// - acabou o estoque: pausa no Mercado Livre e deslista na Shopee (dá para voltar, se a venda for cancelada);
// - ainda sobra: ajusta a quantidade nos outros canais.
// Se o canal recusar, o anúncio fica "erro" e nasce a tarefa "Venda dupla" para o lojista tirar à mão.
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, pecas, tarefas } from "@/db/schema";
import { CANAIS, type Canal } from "@/lib/canais";
import { chamarApi, ErroMl, tokenValido } from "@/lib/mercado-livre";
import { chamarShopee, ErroShopee, lojaValida } from "@/lib/shopee";

type Anuncio = { id: string; canal: Canal; idExterno: string | null; conexaoId: string | null; titulo: string | null };

type Resposta = { response?: { failure_list?: { failed_reason?: string; fail_message?: string }[] } };

async function aplicarNoCanal(a: Anuncio, quantidade: number): Promise<void> {
  if (!a.idExterno || !a.conexaoId) throw new Error("anúncio sem id no canal");
  if (a.canal === "mercado_livre") {
    const token = await tokenValido(a.conexaoId);
    const corpo = quantidade > 0 ? { available_quantity: quantidade } : { status: "paused" };
    await chamarApi(`/items/${a.idExterno}`, token, { metodo: "PUT", json: corpo });
    return;
  }
  if (a.canal === "shopee") {
    const loja = await lojaValida(a.conexaoId);
    const itemId = Number(a.idExterno);
    const r =
      quantidade > 0
        ? await chamarShopee<Resposta>("/api/v2/product/update_stock", loja, {
            json: { item_id: itemId, stock_list: [{ model_id: 0, seller_stock: [{ stock: quantidade }] }] },
          })
        : await chamarShopee<Resposta>("/api/v2/product/unlist_item", loja, { json: { item_list: [{ item_id: itemId, unlist: true }] } });
    const falha = r.response?.failure_list?.[0];
    if (falha) throw new ErroShopee(400, "recusado", falha.fail_message || falha.failed_reason || "A Shopee recusou a mudança.");
    return;
  }
  throw new Error(`canal ${a.canal} ainda não fala com o Plist`);
}

// Chamar depois de baixar o estoque da peça por uma venda no canal `origem`.
// Nunca lança: o pedido já foi gravado, e o que falhar vira tarefa.
export async function acompanharVenda(pecaId: string, origem: Canal): Promise<void> {
  const db = obterDb();
  try {
    const [peca] = await db.select({ contaId: pecas.contaId, quantidade: pecas.quantidade, titulo: pecas.titulo }).from(pecas).where(eq(pecas.id, pecaId));
    if (!peca) return;
    const outros: Anuncio[] = await db
      .select({ id: anuncios.id, canal: anuncios.canal, idExterno: anuncios.idExterno, conexaoId: anuncios.conexaoId, titulo: anuncios.titulo })
      .from(anuncios)
      .where(and(eq(anuncios.pecaId, pecaId), ne(anuncios.canal, origem), inArray(anuncios.situacao, ["ativo", "pausado"])));
    if (!outros.length) return;

    const zerou = peca.quantidade <= 0;
    if (zerou) await db.update(pecas).set({ situacao: "reservada" }).where(eq(pecas.id, pecaId));

    let falhou = false;
    for (const a of outros) {
      try {
        await aplicarNoCanal(a, peca.quantidade);
        if (zerou) await db.update(anuncios).set({ situacao: "removido", removidoEm: new Date(), ultimoErro: null }).where(eq(anuncios.id, a.id));
      } catch (e) {
        falhou = true;
        const motivo = e instanceof ErroMl || e instanceof ErroShopee ? e.message : "o canal não respondeu";
        console.error(`multivenda ${a.canal} falhou:`, e instanceof ErroMl || e instanceof ErroShopee ? e.codigo : e);
        await db.update(anuncios).set({ situacao: zerou ? "erro" : undefined, ultimoErro: motivo.slice(0, 500) }).where(eq(anuncios.id, a.id));
        await db.insert(tarefas).values({
          contaId: peca.contaId,
          tipo: "remover_anuncio_falhou",
          titulo: zerou ? `Tirar do ar à mão: ${peca.titulo}` : `Ajustar a quantidade à mão: ${peca.titulo}`,
          detalhe: `Vendeu em ${CANAIS[origem].nome}, mas ${CANAIS[a.canal].nome} não aceitou a mudança (${motivo}). ${
            zerou ? "Pause o anúncio lá para não vender duas vezes." : `Deixe a quantidade em ${peca.quantidade}.`
          }`,
          pecaId,
          anuncioId: a.id,
          conexaoId: a.conexaoId,
        });
      }
    }
    // tudo fora do ar: a peça termina como vendida; se algo falhou, fica "tirando dos canais" até resolver
    if (zerou && !falhou) await db.update(pecas).set({ situacao: "vendida" }).where(eq(pecas.id, pecaId));
  } catch (e) {
    console.error("multivenda falhou:", e);
  }
}

// Venda nova (ou que acabou de ser paga): baixa o estoque da peça uma vez e leva os outros canais junto.
export async function registrarVenda(anuncio: { id: string; pecaId: string }, quantidade: number, origem: Canal): Promise<void> {
  const db = obterDb();
  await db.execute(sql`
    update pecas set quantidade = greatest(quantidade - ${quantidade}, 0),
      situacao = case when quantidade - ${quantidade} <= 0 then 'vendida'::situacao_peca else situacao end
    where id = ${anuncio.pecaId}`);
  await db.execute(sql`
    update anuncios set situacao = 'vendido'
    where id = ${anuncio.id} and exists (select 1 from pecas where id = ${anuncio.pecaId} and situacao = 'vendida')`);
  await acompanharVenda(anuncio.pecaId, origem);
}

// Venda cancelada depois de contada: devolve a quantidade e põe de volta no ar o que o Plist tirou.
// Nunca lança; o que o canal recusar vira tarefa.
export async function desfazerVenda(anuncio: { id: string; pecaId: string }, quantidade: number, origem: Canal): Promise<void> {
  const db = obterDb();
  try {
    const [peca] = await db
      .update(pecas)
      .set({ quantidade: sql`${pecas.quantidade} + ${quantidade}`, situacao: "disponivel" })
      .where(and(eq(pecas.id, anuncio.pecaId), inArray(pecas.situacao, ["vendida", "reservada", "disponivel"])))
      .returning({ contaId: pecas.contaId, quantidade: pecas.quantidade, titulo: pecas.titulo });
    if (!peca) return; // arquivada ou rascunho: o lojista decide
    // no canal da venda o próprio marketplace devolve o anúncio; aqui só o Plist volta a contar como no ar
    await db.update(anuncios).set({ situacao: "ativo" }).where(and(eq(anuncios.id, anuncio.id), eq(anuncios.situacao, "vendido")));

    const tirados: Anuncio[] = await db
      .select({ id: anuncios.id, canal: anuncios.canal, idExterno: anuncios.idExterno, conexaoId: anuncios.conexaoId, titulo: anuncios.titulo })
      .from(anuncios)
      .where(and(eq(anuncios.pecaId, anuncio.pecaId), ne(anuncios.canal, origem), inArray(anuncios.situacao, ["removido", "ativo", "pausado"])));
    for (const a of tirados) {
      try {
        await reativarNoCanal(a, peca.quantidade);
        await db.update(anuncios).set({ situacao: "ativo", removidoEm: null, ultimoErro: null }).where(eq(anuncios.id, a.id));
      } catch (e) {
        const motivo = e instanceof ErroMl || e instanceof ErroShopee ? e.message : "o canal não respondeu";
        await db.insert(tarefas).values({
          contaId: peca.contaId,
          tipo: "outra",
          titulo: `Voltar ao ar à mão: ${peca.titulo}`,
          detalhe: `A venda em ${CANAIS[origem].nome} foi cancelada, mas ${CANAIS[a.canal].nome} não aceitou reativar (${motivo}).`,
          pecaId: anuncio.pecaId,
          anuncioId: a.id,
          conexaoId: a.conexaoId,
        });
      }
    }
  } catch (e) {
    console.error("desfazer venda falhou:", e);
  }
}

async function reativarNoCanal(a: Anuncio, quantidade: number): Promise<void> {
  if (!a.idExterno || !a.conexaoId) throw new Error("anúncio sem id no canal");
  if (a.canal === "mercado_livre") {
    await chamarApi(`/items/${a.idExterno}`, await tokenValido(a.conexaoId), { metodo: "PUT", json: { status: "active", available_quantity: quantidade } });
    return;
  }
  if (a.canal === "shopee") {
    const loja = await lojaValida(a.conexaoId);
    const itemId = Number(a.idExterno);
    await chamarShopee("/api/v2/product/update_stock", loja, { json: { item_id: itemId, stock_list: [{ model_id: 0, seller_stock: [{ stock: quantidade }] }] } });
    const r = await chamarShopee<Resposta>("/api/v2/product/unlist_item", loja, { json: { item_list: [{ item_id: itemId, unlist: false }] } });
    const falha = r.response?.failure_list?.[0];
    if (falha) throw new ErroShopee(400, "recusado", falha.fail_message || falha.failed_reason || "A Shopee recusou reativar.");
    return;
  }
  throw new Error(`canal ${a.canal} ainda não fala com o Plist`);
}
