// Pedaços comuns das telas do CRM.
import Link from "next/link";
import type { ReactNode } from "react";

// AAAA-MM-DD → "14 de out. de 2026"
export const dataCurta = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

const ABAS = [
  { id: "hoje", nome: "Hoje", href: "/crm" },
  { id: "clientes", nome: "Clientes", href: "/crm/clientes" },
  { id: "funil", nome: "Funil de vendas", href: "/crm/funil" },
  { id: "campanhas", nome: "Campanhas", href: "/crm/campanhas" },
  { id: "captacao", nome: "Captação", href: "/crm/captacao" },
] as const;

// Cabeçalho do CRM com as abas e os atalhos de criar.
export function CabecalhoCrm({ aba, sub, contador, acoes }: { aba: (typeof ABAS)[number]["id"]; sub: string; contador?: number; acoes?: ReactNode }) {
  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">Plano Avançado</p>
          <h1>CRM</h1>
          <p className="sub">{sub}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {acoes}
          <Link className="btn primary" href="/crm/oportunidades/nova">
            + Oportunidade
          </Link>
          <Link className="btn" href="/crm/campanhas/nova">
            + Campanha
          </Link>
        </div>
      </header>
      <nav aria-label="CRM" style={{ display: "flex", gap: 22, borderBottom: "1px solid var(--line)", marginBottom: 18, overflowX: "auto" }}>
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            aria-current={aba === a.id ? "page" : undefined}
            style={{
              padding: "10px 2px",
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
              color: aba === a.id ? "var(--ink)" : "var(--muted)",
              borderBottom: `2px solid ${aba === a.id ? "var(--accent)" : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {a.nome}
            {a.id === "hoje" && contador ? (
              <span className="count" style={{ marginLeft: 6, fontSize: ".72rem", color: "var(--warn)" }}>
                {contador}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
    </>
  );
}

// Botão de WhatsApp com a mensagem pronta, ou o motivo de não ter.
export function BotaoZap({ zap, semZap }: { zap: string | null; semZap: string | null }) {
  return zap ? (
    <a className="btn small" href={zap} target="_blank" rel="noreferrer" style={{ color: "var(--good)", borderColor: "var(--good)" }}>
      WhatsApp
    </a>
  ) : (
    <span className="muted" style={{ fontSize: ".8rem" }}>
      {semZap}
    </span>
  );
}
