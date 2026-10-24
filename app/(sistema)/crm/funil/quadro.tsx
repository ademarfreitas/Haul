"use client";
// Quadro do funil: arrastar o cartão de uma coluna para outra (computador) ou "Mover" (celular).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moverOportunidade } from "../acoes-funil";

export type Cartao = { id: string; numero: number; titulo: string; nome: string; valor: string; etapa: string; quando: string | null; atrasada: boolean };
type Coluna = { id: string; nome: string; total: string; dica: string };

export function Quadro({ colunas, cartoes }: { colunas: Coluna[]; cartoes: Cartao[] }) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  const [sobre, setSobre] = useState<string | null>(null);

  const mover = (id: string, para: string) => {
    if (para === "perdido") return router.push(`/crm/oportunidades/${id}?perder=1`);
    const f = new FormData();
    f.set("id", id);
    f.set("para", para);
    iniciar(async () => {
      await moverOportunidade(f);
      router.refresh();
    });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${colunas.length}, minmax(170px, 1fr))`, gap: 12, overflowX: "auto", paddingBottom: 8 }}>
      {colunas.map((col) => (
        <section
          key={col.id}
          aria-label={col.nome}
          onDragOver={(e) => {
            e.preventDefault();
            setSobre(col.id);
          }}
          onDragLeave={() => setSobre(null)}
          onDrop={(e) => {
            e.preventDefault();
            setSobre(null);
            const id = e.dataTransfer.getData("text/plain");
            const c = cartoes.find((x) => x.id === id);
            if (c && c.etapa !== col.id) mover(id, col.id);
          }}
          style={{
            background: sobre === col.id ? "var(--accent-soft)" : "var(--sunk)",
            borderRadius: "var(--r)",
            padding: 10,
            minHeight: 160,
          }}
        >
          <header style={{ marginBottom: 8 }}>
            <b style={{ fontSize: ".9rem" }}>{col.nome}</b>
            <div className="muted" style={{ fontSize: ".76rem" }} title={col.dica}>
              {cartoes.filter((c) => c.etapa === col.id).length} · {col.total}
            </div>
          </header>
          {cartoes
            .filter((c) => c.etapa === col.id)
            .map((c) => (
              <article
                key={c.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                className="panel"
                style={{ margin: "0 0 8px", padding: 10, cursor: "grab" }}
              >
                <Link href={`/crm/oportunidades/${c.id}`} style={{ fontWeight: 600, fontSize: ".88rem" }}>
                  #{c.numero} {c.titulo}
                </Link>
                <div className="muted" style={{ fontSize: ".78rem", marginTop: 2 }}>
                  {c.nome} · {c.valor}
                </div>
                {c.quando && (
                  <div style={{ fontSize: ".76rem", marginTop: 2, color: c.atrasada ? "var(--bad)" : "var(--muted)" }}>
                    {c.atrasada ? "Atrasada: " : "Próxima: "}
                    {c.quando}
                  </div>
                )}
                <select
                  aria-label="Mover para"
                  value=""
                  onChange={(e) => e.target.value && mover(c.id, e.target.value)}
                  style={{ marginTop: 6, fontSize: ".78rem", padding: "2px 4px", width: "100%" }}
                >
                  <option value="">Mover…</option>
                  {colunas
                    .filter((x) => x.id !== c.etapa)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nome}
                      </option>
                    ))}
                </select>
              </article>
            ))}
        </section>
      ))}
    </div>
  );
}
