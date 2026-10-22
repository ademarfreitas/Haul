"use client";
// Menu da esquerda (no celular vira barra embaixo), com os mesmos itens do protótipo.
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/inventario", nome: "Inventário" },
  { href: "/tarefas", nome: "Tarefas", contador: "tarefas" },
  { href: "/estoque", nome: "Estoque" },
  { href: "/novo-anuncio", nome: "Novo anúncio", curto: "Anunciar" },
  { href: "/pedidos", nome: "Pedidos" },
  { href: "/resultados", nome: "Resultados" },
  { href: "/canais", nome: "Canais", contador: "canais" },
  { href: "/avisos", nome: "Avisos" },
  { href: "/minha-conta", nome: "Minha conta", curto: "Conta" },
] as const;

type Props = {
  contadores: { tarefas: number; canais: number };
  teste: { texto: string; acabou: boolean } | null;
  sair: () => Promise<void>;
};

export function Menu({ contadores, teste, sair }: Props) {
  const aqui = usePathname();
  return (
    <nav className="rail" aria-label="Principal">
      <Link className="brand" href="/inventario" style={{ textDecoration: "none" }}>
        <span className="brand-mark" aria-hidden="true"></span>
        <b>Plist</b>
      </Link>
      {ITENS.map((i) => {
        const n = "contador" in i ? contadores[i.contador] : 0;
        return (
          <Link className="nav" key={i.href} href={i.href} aria-current={aqui.startsWith(i.href) ? "page" : undefined}>
            <span>
              {"curto" in i ? (
                <>
                  <span className="lbl-l">{i.nome}</span>
                  <span className="lbl-s">{i.curto}</span>
                </>
              ) : (
                i.nome
              )}
            </span>
            {n > 0 && <span className="count">{n}</span>}
          </Link>
        );
      })}
      {teste && (
        <Link className={`trialchip${teste.acabou ? " bad" : ""}`} href="/minha-conta">
          {teste.texto}
        </Link>
      )}
      <form action={sair} style={{ marginTop: 6 }}>
        <button className="nav" type="submit" style={{ width: "100%", boxSizing: "border-box" }}>
          <span>Sair</span>
        </button>
      </form>
    </nav>
  );
}
