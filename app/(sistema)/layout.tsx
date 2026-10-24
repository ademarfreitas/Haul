import type { ReactNode } from "react";
import Link from "next/link";
import { and, count, eq, ne } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal, tarefas } from "@/db/schema";
import { contaAtual, diasDeTeste } from "@/lib/conta";
import { sair } from "../_acesso/acoes";
import { Icone } from "./_partes/icone";
import { Menu } from "./_partes/menu";
import "./sistema.css";
import "./tema.css";

const DIAS_DE_TESTE = 30;

// Casca do sistema: menu + barra do topo + área de trabalho. Cada página chama exigirConta("/caminho"), que
// manda para /entrar ou para os primeiros passos quando falta algo; aqui, sem conta, só não desenha a casca.
export default async function LayoutSistema({ children }: { children: ReactNode }) {
  const atual = await contaAtual();
  if (!atual) return children;
  const { conta, usuario } = atual;

  const db = obterDb();
  const [[abertas], [problemas]] = await Promise.all([
    db.select({ n: count() }).from(tarefas).where(and(eq(tarefas.contaId, conta.id), eq(tarefas.situacao, "aberta"))),
    db.select({ n: count() }).from(conexoesCanal).where(and(eq(conexoesCanal.contaId, conta.id), ne(conexoesCanal.situacao, "ativa"))),
  ]);

  const dias = diasDeTeste(conta.testeAte);
  const teste =
    conta.situacaoAssinatura === "teste"
      ? {
          texto: dias > 0 ? `Teste grátis: ${dias} ${dias === 1 ? "dia" : "dias"}` : "Teste grátis terminou",
          acabou: dias === 0,
          usados: Math.round((Math.min(DIAS_DE_TESTE, DIAS_DE_TESTE - dias) / DIAS_DE_TESTE) * 100),
        }
      : null;
  const iniciais = usuario.nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

  return (
    <div className="app">
      <Menu contadores={{ tarefas: abertas.n, canais: problemas.n }} teste={teste} sair={sair} />
      <div className="coluna">
        <header className="topo-sis">
          <Link className="marca-cel" href="/inventario">
            <picture>
              <source srcSet="/plist-logo-branco.svg" media="(prefers-color-scheme: dark)" />
              <img src="/plist-logo.svg" alt="Plist" />
            </picture>
          </Link>
          <form className="busca" action="/estoque" role="search">
            <Icone nome="busca" tamanho={16} />
            <input type="search" name="q" placeholder="Buscar peça por título, marca ou SKU" aria-label="Buscar no estoque" />
          </form>
          <div className="dir">
            <Link className="btn primary novo" href="/novo-anuncio">
              <Icone nome="mais" tamanho={16} />
              <span>Novo anúncio</span>
            </Link>
            <Link className="quem" href="/minha-conta" aria-label="Minha conta">
              <span className="avatar" aria-hidden="true">{iniciais || "?"}</span>
              <div>
                <b>{usuario.nome}</b>
                {conta.nome !== usuario.nome && <small>{conta.nome}</small>}
              </div>
            </Link>
          </div>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
