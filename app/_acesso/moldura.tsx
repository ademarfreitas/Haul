import type { ReactNode } from "react";

// Moldura das telas de acesso: logo, link de volta ao site e o cartão do formulário.
export function Moldura({ titulo, sub, selo, children }: { titulo: string; sub?: string; selo?: string; children: ReactNode }) {
  return (
    <div className="acesso">
      <div className="acesso-topo">
        <a href="/"><img src="/plist-logo.svg" alt="Plist" height={30} /></a>
        <a className="suave" href="/">← Voltar ao site</a>
      </div>
      {selo && <p className="pilula">{selo}</p>}
      <div className="cartao">
        <h1>{titulo}</h1>
        {sub && <p className="suave">{sub}</p>}
        {children}
      </div>
    </div>
  );
}
