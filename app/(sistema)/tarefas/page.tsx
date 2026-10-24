import Link from "next/link";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { pecas, pedidos, tarefas } from "@/db/schema";
import { exigirConta } from "@/lib/conta";
import { AtualizarPedidos } from "../_partes/atualizar-pedidos";
import { fecharTarefa, reabrirTarefa } from "./acoes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Tarefas · Plist" };

const TIPOS: Record<string, [string, string]> = {
  imprimir_etiqueta: ["p-warn", "Etiqueta"],
  despachar: ["p-warn", "Despachar"],
  emitir_documento_fiscal: ["p-accent", "Nota fiscal"],
  conferir_taxa: ["p-accent", "Taxa"],
  remover_anuncio_falhou: ["p-bad", "Venda dupla"],
  reconectar_canal: ["p-bad", "Canal"],
  responder_comprador: ["p-accent", "Comprador"],
  outra: ["p-muted", "Outra"],
};

const ABAS = { abertas: "A fazer", feitas: "Feitas" } as const;

function Prazo({ d }: { d: Date | null }) {
  if (!d) return <span className="muted">—</span>;
  const agora = new Date();
  const fmt = d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const hoje = d.toDateString() === agora.toDateString();
  return <span className={`due${d < agora ? " late" : hoje ? " today" : ""}`}>{d < agora ? `Atrasada · ${fmt}` : hoje ? `Hoje · ${fmt}` : fmt}</span>;
}

export default async function Tarefas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { conta } = await exigirConta("/tarefas");
  const aba = (await searchParams).aba === "feitas" ? "feitas" : "abertas";
  const db = obterDb();

  const [contagem, lista] = await Promise.all([
    db
      .select({ aberta: sql<boolean>`${tarefas.situacao} = 'aberta'`, n: count() })
      .from(tarefas)
      .where(eq(tarefas.contaId, conta.id))
      .groupBy(sql`${tarefas.situacao} = 'aberta'`),
    db
      .select({
        id: tarefas.id,
        tipo: tarefas.tipo,
        situacao: tarefas.situacao,
        titulo: tarefas.titulo,
        detalhe: tarefas.detalhe,
        prazo: tarefas.prazo,
        criadoEm: tarefas.criadoEm,
        concluidaEm: tarefas.concluidaEm,
        pedidoId: tarefas.pedidoId,
        pedidoSituacao: pedidos.situacao,
        pedidoCanal: pedidos.canal,
        sku: pecas.sku,
      })
      .from(tarefas)
      .leftJoin(pedidos, eq(pedidos.id, tarefas.pedidoId))
      .leftJoin(pecas, eq(pecas.id, tarefas.pecaId))
      .where(and(eq(tarefas.contaId, conta.id), aba === "abertas" ? eq(tarefas.situacao, "aberta") : sql`${tarefas.situacao} <> 'aberta'`))
      .orderBy(aba === "abertas" ? sql`${tarefas.prazo} asc nulls last` : desc(tarefas.concluidaEm), asc(tarefas.criadoEm))
      .limit(200),
  ]);
  const n = (aberta: boolean) => contagem.find((c) => c.aberta === aberta)?.n ?? 0;

  return (
    <>
      <header className="vhead">
        <div>
          <h1>Tarefas</h1>
          <p className="sub">O que falta da sua parte em cada venda, do pedido até o dinheiro liberado.</p>
        </div>
        <AtualizarPedidos />
      </header>
      <div className="tk-box">
        <div className="tabs" role="tablist">
          {(Object.keys(ABAS) as (keyof typeof ABAS)[]).map((k) => (
            <Link key={k} href={k === "abertas" ? "/tarefas" : "/tarefas?aba=feitas"} role="tab" aria-selected={aba === k} style={{ padding: "10px 2px", fontWeight: 600, textDecoration: "none", color: aba === k ? "var(--ink)" : "var(--muted)", borderBottom: `2px solid ${aba === k ? "var(--accent)" : "transparent"}`, marginBottom: -1 }}>
              {ABAS[k]}
              <span className="n">{n(k === "abertas")}</span>
            </Link>
          ))}
        </div>
        <div className="tk-info">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          <span>
            As tarefas nascem das vendas: <b>Atualizar pedidos</b> traz as vendas do Mercado Livre e da Shopee, abre a tarefa da etiqueta e fecha sozinha quando o envio sai.
          </span>
        </div>
        {lista.length === 0 ? (
          <div className="tk-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth="1.6" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="m8 12 3 3 5-6" />
            </svg>
            {aba === "abertas" ? "Nada pendente. Quando vender, a próxima tarefa aparece aqui." : "Nenhuma tarefa feita ainda."}
          </div>
        ) : (
          <div className="tw">
            <table className="tk" style={{ minWidth: 720 }}>
              <tbody>
                <tr>
                  <th>Tipo</th>
                  <th>Tarefa</th>
                  <th>Prazo</th>
                  <th></th>
                </tr>
                {lista.map((t) => {
                  const [cls, txt] = TIPOS[t.tipo];
                  const atrasada = t.situacao === "aberta" && t.prazo && t.prazo < new Date();
                  return (
                    <tr key={t.id} className={atrasada ? "late" : undefined}>
                      <td>
                        <span className={`pill ${cls}`}>{txt}</span>
                      </td>
                      <td style={{ whiteSpace: "normal" }}>
                        <b>{t.titulo}</b>
                        <span className="sub2">
                          {t.detalhe}
                          {t.sku ? ` · ${t.sku}` : ""}
                        </span>
                      </td>
                      <td>{t.situacao === "aberta" ? <Prazo d={t.prazo} /> : <span className="muted">{t.situacao === "ignorada" ? "Ignorada" : "Feita"}</span>}</td>
                      <td>
                        <div className="actions" style={{ justifyContent: "flex-end" }}>
                          {t.situacao === "aberta" && t.tipo === "imprimir_etiqueta" && t.pedidoId && (
                            <a
                              className="btn small primary"
                              href={
                                t.pedidoCanal === "shopee"
                                  ? `/api/canais/shopee/etiqueta?pedido=${t.pedidoId}${t.pedidoSituacao === "pago" ? "&organizar=1" : ""}`
                                  : `/api/canais/mercado-livre/etiqueta?pedido=${t.pedidoId}`
                              }
                              target="_blank"
                              rel="noreferrer"
                            >
                              Etiqueta
                            </a>
                          )}
                          {t.situacao === "aberta" && t.tipo === "reconectar_canal" && (
                            <Link className="btn small primary" href="/canais">
                              Reconectar
                            </Link>
                          )}
                          {t.pedidoId && (
                            <Link className="btn small" href="/pedidos?estado=todos">
                              Pedido
                            </Link>
                          )}
                          {t.situacao === "aberta" ? (
                            <form action={fecharTarefa} className="actions">
                              <input type="hidden" name="id" value={t.id} />
                              <button className="btn small" type="submit" name="como" value="concluida">
                                Feito
                              </button>
                              <button className="btn small ghost" type="submit" name="como" value="ignorada">
                                Ignorar
                              </button>
                            </form>
                          ) : (
                            <form action={reabrirTarefa}>
                              <input type="hidden" name="id" value={t.id} />
                              <button className="btn small ghost" type="submit">
                                Reabrir
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
