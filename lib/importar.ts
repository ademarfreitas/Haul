// Grava no estoque o que veio do fornecedor (nota ou planilha, lidas em lib/fornecedor-arquivo.ts).
// Produto que já existe (mesmo código no fornecedor, ou mesmo código de barras) soma a quantidade e atualiza o custo;
// produto novo entra como rascunho, pronto para anunciar. Custo maior vira aviso (lib/avisos.ts).
import { and, eq, inArray, sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { fornecedores, pecas } from "@/db/schema";
import { avisarCustos, conferirEstoqueBaixo, type MudancaDeCusto } from "@/lib/avisos";
import type { ItemImportado } from "@/lib/fornecedor-arquivo";
import { levarEstoqueAosCanais } from "@/lib/multivenda";
import { proximoSku } from "@/lib/sku";

export type Resultado = { criadas: { id: string; sku: string; titulo: string }[]; atualizadas: number; custoSubiu: number };

export async function acharOuCriarFornecedor(contaId: string, nome: string, documento: string, colunas?: Record<string, string>) {
  const db = obterDb();
  const doc = documento.replace(/\D/g, "") || null;
  const [porDoc] = doc ? await db.select().from(fornecedores).where(and(eq(fornecedores.contaId, contaId), eq(fornecedores.documento, doc))) : [];
  const [porNome] = porDoc ? [porDoc] : await db.select().from(fornecedores).where(and(eq(fornecedores.contaId, contaId), eq(fornecedores.nome, nome)));
  if (porNome) {
    if (colunas || (doc && !porNome.documento)) {
      await db
        .update(fornecedores)
        .set({ ...(colunas ? { colunas } : {}), ...(doc && !porNome.documento ? { documento: doc } : {}) })
        .where(eq(fornecedores.id, porNome.id));
    }
    return porNome;
  }
  const [novo] = await db.insert(fornecedores).values({ contaId, nome, documento: doc, colunas: colunas ?? null }).returning();
  return novo;
}

export async function importarItens(contaId: string, fornecedorId: string, itens: ItemImportado[], origem: string): Promise<Resultado> {
  const db = obterDb();
  const codigos = itens.map((i) => i.codigo).filter(Boolean);
  const eans = itens.map((i) => i.ean).filter(Boolean);
  const existentes = await db
    .select({ id: pecas.id, titulo: pecas.titulo, custo: pecas.custoCentavos, ean: pecas.ean, codigo: pecas.codigoFornecedor, fornecedorId: pecas.fornecedorId, situacao: pecas.situacao })
    .from(pecas)
    .where(
      and(
        eq(pecas.contaId, contaId),
        sql`(${codigos.length ? sql`(${pecas.fornecedorId} = ${fornecedorId} and ${inArray(pecas.codigoFornecedor, codigos)})` : sql`false`} or ${eans.length ? inArray(pecas.ean, eans) : sql`false`})`,
        sql`${pecas.situacao} <> 'arquivada'`,
      ),
    );
  const porCodigo = new Map(existentes.filter((p) => p.fornecedorId === fornecedorId && p.codigo).map((p) => [p.codigo!, p]));
  const porEan = new Map(existentes.filter((p) => p.ean).map((p) => [p.ean!, p]));

  const resultado: Resultado = { criadas: [], atualizadas: 0, custoSubiu: 0 };
  const mudancas: MudancaDeCusto[] = [];
  const tocadas: string[] = [];
  for (const i of itens) {
    const ja = (i.codigo && porCodigo.get(i.codigo)) || (i.ean && porEan.get(i.ean)) || null;
    if (ja) {
      await db
        .update(pecas)
        .set({
          quantidade: sql`${pecas.quantidade} + ${i.quantidade}`,
          ...(i.custoCentavos != null ? { custoCentavos: i.custoCentavos } : {}),
          ...(i.quantidade > 0 && (ja.situacao === "vendida" || ja.situacao === "reservada") ? { situacao: "disponivel" as const } : {}),
          ean: ja.ean ?? (i.ean || null),
          fornecedorId: ja.fornecedorId ?? fornecedorId,
          codigoFornecedor: ja.codigo ?? (i.codigo || null),
        })
        .where(eq(pecas.id, ja.id));
      if (ja.custo != null && i.custoCentavos != null && i.custoCentavos !== ja.custo) {
        mudancas.push({ pecaId: ja.id, titulo: ja.titulo, antes: ja.custo, depois: i.custoCentavos });
      }
      resultado.atualizadas++;
      if (i.quantidade > 0) tocadas.push(ja.id);
      continue;
    }
    const sku = await proximoSku(contaId);
    const [nova] = await db
      .insert(pecas)
      .values({
        contaId,
        sku,
        titulo: i.titulo,
        marca: i.marca || null,
        condicao: "nova_sem_etiqueta",
        precoCentavos: i.precoCentavos ?? 0,
        custoCentavos: i.custoCentavos,
        quantidade: Math.max(i.quantidade, 0),
        ean: i.ean || null,
        fornecedorId,
        codigoFornecedor: i.codigo || null,
        situacao: "rascunho",
      })
      .returning({ id: pecas.id });
    resultado.criadas.push({ id: nova.id, sku, titulo: i.titulo });
    // a mesma nota pode repetir o produto em duas linhas: a segunda soma na primeira
    const criada = { id: nova.id, titulo: i.titulo, custo: i.custoCentavos, ean: i.ean || null, codigo: i.codigo || null, fornecedorId, situacao: "rascunho" as const };
    if (i.codigo) porCodigo.set(i.codigo, criada);
    if (i.ean) porEan.set(i.ean, criada);
  }

  resultado.custoSubiu = mudancas.filter((m) => m.depois > m.antes).length;
  await avisarCustos(contaId, mudancas, origem);
  if (tocadas.length) {
    // chegou mercadoria: fecha o "repor estoque" de quem passou do mínimo e leva a quantidade aos anúncios
    await db.execute(sql`
      update tarefas set situacao = 'concluida', concluida_em = now()
      where conta_id = ${contaId} and tipo = 'repor_estoque' and situacao = 'aberta'
        and peca_id in (select id from pecas where id in (${sql.join(tocadas.map((id) => sql`${id}`), sql`, `)}) and (estoque_minimo is null or quantidade > estoque_minimo))`);
    for (const id of tocadas) await levarEstoqueAosCanais(id);
    await conferirEstoqueBaixo({ pecaIds: tocadas });
  }
  return resultado;
}
