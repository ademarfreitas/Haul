"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { importacoes, pecas } from "@/db/schema";
import { conferirEstoqueBaixo } from "@/lib/avisos";
import { contaAtual } from "@/lib/conta";
import { CAMPOS, conferirItens } from "@/lib/fornecedor-arquivo";
import { acharOuCriarFornecedor, importarItens, type Resultado } from "@/lib/importar";

export type EstadoImportacao = { erro?: string; feito?: Resultado & { fornecedor: string } };

// O navegador já leu o arquivo e mostrou a prévia; aqui confere tudo de novo e grava.
export async function confirmarImportacao(_: EstadoImportacao, f: FormData): Promise<EstadoImportacao> {
  const atual = await contaAtual();
  if (!atual) return { erro: "Sua sessão terminou. Entre de novo." };
  const contaId = atual.conta.id;

  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(String(f.get("dados") ?? "{}"));
  } catch {
    return { erro: "Não deu para ler a importação. Escolha o arquivo de novo." };
  }
  const tipo = dados.tipo === "nfe" ? "nfe" : "planilha";
  const nome = String(dados.fornecedor ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const documento = String(dados.documento ?? "").replace(/\D/g, "").slice(0, 14);
  const chave = tipo === "nfe" && /^\d{44}$/.test(String(dados.chave ?? "")) ? String(dados.chave) : null;
  const numero = String(dados.numero ?? "").slice(0, 20) || null;
  const itens = conferirItens(dados.itens);
  const minimoBruto = Number.parseInt(String(f.get("minimo") ?? ""), 10);
  const minimo = Number.isFinite(minimoBruto) && minimoBruto >= 0 ? Math.min(minimoBruto, 9999) : null;
  let colunas: Record<string, string> | undefined;
  if (tipo === "planilha" && dados.colunas && typeof dados.colunas === "object") {
    colunas = {};
    for (const c of CAMPOS) {
      const v = (dados.colunas as Record<string, unknown>)[c];
      if (typeof v === "string" && v) colunas[c] = v.slice(0, 120);
    }
  }

  if (!nome) return { erro: "Diga de qual fornecedor é a planilha." };
  if (!itens.length) return { erro: "Nenhum produto com nome para importar." };

  const db = obterDb();
  if (chave) {
    const [ja] = await db.select({ id: importacoes.id }).from(importacoes).where(and(eq(importacoes.contaId, contaId), eq(importacoes.chaveNfe, chave)));
    if (ja) return { erro: "Esta nota já foi importada antes. As quantidades não foram somadas de novo." };
  }

  const fornecedor = await acharOuCriarFornecedor(contaId, nome, documento, colunas);
  // grava a nota antes de somar: duas abas importando a mesma nota não somam duas vezes
  const [registro] = await db
    .insert(importacoes)
    .values({ contaId, fornecedorId: fornecedor.id, tipo, chaveNfe: chave, numero, itens: itens.length, criadas: 0, atualizadas: 0 })
    .onConflictDoNothing()
    .returning({ id: importacoes.id });
  if (!registro) return { erro: "Esta nota já foi importada antes. As quantidades não foram somadas de novo." };

  const origem = tipo === "nfe" ? `nota ${numero ?? ""} de ${fornecedor.nome}`.replace("  ", " ") : `planilha de ${fornecedor.nome}`;
  const r = await importarItens(contaId, fornecedor.id, itens, origem);
  await db.update(importacoes).set({ criadas: r.criadas.length, atualizadas: r.atualizadas }).where(eq(importacoes.id, registro.id));

  if (minimo != null) {
    const codigos = new Set(itens.map((i) => i.codigo).filter(Boolean));
    const eans = new Set(itens.map((i) => i.ean).filter(Boolean));
    const doFornecedor = await db
      .select({ id: pecas.id, codigo: pecas.codigoFornecedor, ean: pecas.ean })
      .from(pecas)
      .where(and(eq(pecas.contaId, contaId), eq(pecas.fornecedorId, fornecedor.id)));
    for (const p of doFornecedor.filter((p) => (p.codigo && codigos.has(p.codigo)) || (p.ean && eans.has(p.ean)))) {
      await db.update(pecas).set({ estoqueMinimo: minimo }).where(eq(pecas.id, p.id));
    }
    await conferirEstoqueBaixo({ contaId });
  }

  revalidatePath("/estoque");
  revalidatePath("/tarefas");
  return { feito: { ...r, fornecedor: fornecedor.nome } };
}
