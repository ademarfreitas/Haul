"use client";
// Menu da esquerda, escuro e em grupos (no celular vira barra embaixo), com os mesmos itens do protótipo.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icone, type NomeIcone } from "./icone";

type Item = { href: string; nome: string; icone: NomeIcone; curto?: string; contador?: "tarefas" | "canais" };

const GRUPOS: { nome: string; itens: Item[] }[] = [
  {
    nome: "Operação",
    itens: [
      { href: "/inventario", nome: "Inventário", icone: "grade" },
      { href: "/tarefas", nome: "Tarefas", icone: "tarefa", contador: "tarefas" },
      { href: "/estoque", nome: "Estoque", icone: "caixa" },
      { href: "/novo-anuncio", nome: "Novo anúncio", curto: "Anunciar", icone: "mais" },
      { href: "/pedidos", nome: "Pedidos", icone: "sacola" },
    ],
  },
  {
    nome: "Análise",
    itens: [
      { href: "/resultados", nome: "Resultados", icone: "grafico" },
      { href: "/crm", nome: "CRM", icone: "pessoas" },
    ],
  },
  {
    nome: "Configuração",
    itens: [
      { href: "/canais", nome: "Canais", icone: "tomada", contador: "canais" },
      { href: "/avisos", nome: "Avisos", icone: "sino" },
      { href: "/minha-conta", nome: "Minha conta", curto: "Conta", icone: "pessoa" },
    ],
  },
];

type Props = {
  contadores: { tarefas: number; canais: number };
  teste: { texto: string; acabou: boolean; usados: number } | null;
  sair: () => Promise<void>;
};

export function Menu({ contadores, teste, sair }: Props) {
  const aqui = usePathname();
  return (
    <nav className="rail" aria-label="Principal">
      <Link className="brand" href="/inventario">
        <img src="/plist-logo-branco.svg" alt="Plist" />
      </Link>
      {GRUPOS.map((g) => (
        <div key={g.nome} style={{ display: "contents" }}>
          <span className="grupo">{g.nome}</span>
          {g.itens.map((i) => {
            const n = i.contador ? contadores[i.contador] : 0;
            return (
              <Link className="nav" key={i.href} href={i.href} aria-current={aqui.startsWith(i.href) ? "page" : undefined}>
                <Icone nome={i.icone} />
                <span>
                  {i.curto ? (
                    <>
                      <span className="lbl-l">{i.nome}</span>
                      <span className="lbl-s">{i.curto}</span>
                    </>
                  ) : (
                    i.nome
                  )}
                </span>
                {n > 0 && <span className={`count${i.contador === "canais" ? " aviso" : ""}`}>{n}</span>}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="rail-pe">
        {teste && (
          <Link className={`trialchip${teste.acabou ? " bad" : ""}`} href="/minha-conta">
            <b>{teste.texto}</b>
            <span className="barra" aria-hidden="true">
              <i style={{ width: `${teste.usados}%` }} />
            </span>
            <span className="cta">Escolher plano</span>
          </Link>
        )}
        <form action={sair}>
          <button className="nav" type="submit" style={{ width: "100%", boxSizing: "border-box" }}>
            <Icone nome="sair" />
            <span>Sair</span>
          </button>
        </form>
      </div>
    </nav>
  );
}
