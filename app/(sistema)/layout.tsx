import type { ReactNode } from "react";
import { and, count, eq, ne } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal, tarefas } from "@/db/schema";
import { contaAtual, diasDeTeste } from "@/lib/conta";
import { sair } from "../_acesso/acoes";
import { Menu } from "./_partes/menu";
import "./sistema.css";

// Casca do sistema: menu + área de trabalho. Cada página chama exigirConta("/caminho"), que manda para
// /entrar ou para os primeiros passos quando falta algo; aqui, sem conta, só não desenha o menu.
export default async function LayoutSistema({ children }: { children: ReactNode }) {
  const atual = await contaAtual();
  if (!atual) return children;
  const { conta } = atual;

  const db = obterDb();
  const [[abertas], [problemas]] = await Promise.all([
    db.select({ n: count() }).from(tarefas).where(and(eq(tarefas.contaId, conta.id), eq(tarefas.situacao, "aberta"))),
    db.select({ n: count() }).from(conexoesCanal).where(and(eq(conexoesCanal.contaId, conta.id), ne(conexoesCanal.situacao, "ativa"))),
  ]);

  const dias = diasDeTeste(conta.testeAte);
  const teste =
    conta.situacaoAssinatura === "teste"
      ? { texto: dias > 0 ? `Teste grátis: ${dias} ${dias === 1 ? "dia" : "dias"}` : "Teste grátis terminou", acabou: dias === 0 }
      : null;

  return (
    <div className="app">
      <Menu contadores={{ tarefas: abertas.n, canais: problemas.n }} teste={teste} sair={sair} />
      <main className="main">{children}</main>
    </div>
  );
}
