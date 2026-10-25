import { desc, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { fornecedores, importacoes } from "@/db/schema";
import { exigirConta } from "@/lib/conta";
import { Importador } from "./importador";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Importar do fornecedor · Plist" };

export default async function ImportarDoFornecedor() {
  const { conta } = await exigirConta("/estoque/importar");
  const db = obterDb();
  const lista = await db
    .select({ nome: fornecedores.nome, colunas: fornecedores.colunas })
    .from(fornecedores)
    .where(eq(fornecedores.contaId, conta.id))
    .orderBy(fornecedores.nome);
  const recentes = await db
    .select({ id: importacoes.id, tipo: importacoes.tipo, numero: importacoes.numero, criadas: importacoes.criadas, atualizadas: importacoes.atualizadas, em: importacoes.criadoEm, fornecedor: fornecedores.nome })
    .from(importacoes)
    .leftJoin(fornecedores, eq(fornecedores.id, importacoes.fornecedorId))
    .where(eq(importacoes.contaId, conta.id))
    .orderBy(desc(importacoes.criadoEm))
    .limit(8);

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">Estoque</p>
          <h1>Importar do fornecedor</h1>
          <p className="sub">
            Traga os produtos da nota fiscal de compra (o arquivo XML que o fornecedor manda) ou da planilha dele. Produto novo entra como rascunho, com o custo
            preenchido; produto que você já tem soma a quantidade. Se o custo subir, o Plist avisa em Tarefas.
          </p>
        </div>
      </header>
      <Importador fornecedores={lista.map((f) => ({ nome: f.nome, colunas: f.colunas ?? {} }))} />
      {recentes.length > 0 && (
        <div className="panel">
          <h2>Últimas importações</h2>
          <div className="tbl" style={{ marginTop: 8 }}>
            {recentes.map((r) => (
              <div className="tr" key={r.id} style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: "1px solid var(--line)", fontSize: ".86rem" }}>
                <span className="muted" style={{ minWidth: 90 }}>{r.em.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                <span style={{ flex: 1 }}>
                  {r.tipo === "nfe" ? `Nota ${r.numero ?? ""}` : "Planilha"} · {r.fornecedor ?? "fornecedor removido"}
                </span>
                <span className="muted">
                  {r.criadas} {r.criadas === 1 ? "novo" : "novos"}, {r.atualizadas} {r.atualizadas === 1 ? "atualizado" : "atualizados"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
