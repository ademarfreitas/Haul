import Link from "next/link";
import { and, asc, count, desc, eq, gte, isNotNull, lt, ne, sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, fotosPeca, pecas, pedidos, tarefas } from "@/db/schema";
import { CANAIS, reais, type Canal } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resultados · Plist" };

const PERIODOS = [7, 30, 90] as const;
const DIAS_PARADO = 60;

// Lucro = venda − taxa (real, ou a estimada enquanto a real não chega) − custo informado na peça
const taxaSql = sql<number>`coalesce(${pedidos.taxaRealCentavos}, ${pedidos.taxaEstimadaCentavos}, 0)`;
const lucroSql = sql<number>`${pedidos.valorVendaCentavos} - ${taxaSql} - coalesce(${pecas.custoCentavos}, 0)`;

export default async function Resultados({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { conta } = await exigirConta("/resultados");
  const pedido = Number((await searchParams).dias);
  const dias = (PERIODOS as readonly number[]).includes(pedido) ? pedido : 30;
  const desde = new Date(Date.now() - dias * 86_400_000);
  const db = obterDb();
  const valido = and(eq(pedidos.contaId, conta.id), ne(pedidos.situacao, "cancelado"), gte(pedidos.vendidoEm, desde));

  const [[kpi], porCanal, porDia, top, taxas, parados, [abertas]] = await Promise.all([
    db
      .select({ n: count(), vendido: sql<number>`coalesce(sum(${pedidos.valorVendaCentavos}), 0)::int`, lucro: sql<number>`coalesce(sum(${lucroSql}), 0)::int` })
      .from(pedidos)
      .leftJoin(pecas, eq(pecas.id, pedidos.pecaId))
      .where(valido),
    db
      .select({ canal: pedidos.canal, n: count(), lucro: sql<number>`coalesce(sum(${lucroSql}), 0)::int` })
      .from(pedidos)
      .leftJoin(pecas, eq(pecas.id, pedidos.pecaId))
      .where(valido)
      .groupBy(pedidos.canal),
    db
      .select({ dia: sql<string>`to_char(${pedidos.vendidoEm} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`, valor: sql<number>`sum(${pedidos.valorVendaCentavos})::int` })
      .from(pedidos)
      .where(valido)
      .groupBy(sql`1`),
    db
      .select({ titulo: pecas.titulo, sku: pecas.sku, n: count(), vendido: sql<number>`sum(${pedidos.valorVendaCentavos})::int`, lucro: sql<number>`sum(${lucroSql})::int` })
      .from(pedidos)
      .innerJoin(pecas, eq(pecas.id, pedidos.pecaId))
      .where(valido)
      .groupBy(pecas.id, pecas.titulo, pecas.sku)
      .orderBy(desc(sql`sum(${pedidos.valorVendaCentavos})`))
      .limit(10),
    db
      .select({
        idExterno: pedidos.idExterno,
        canal: pedidos.canal,
        titulo: pecas.titulo,
        estimada: pedidos.taxaEstimadaCentavos,
        real: pedidos.taxaRealCentavos,
        confirmada: pedidos.taxaConfirmadaCentavos,
      })
      .from(pedidos)
      .leftJoin(pecas, eq(pecas.id, pedidos.pecaId))
      .where(and(valido, isNotNull(pedidos.taxaEstimadaCentavos), isNotNull(pedidos.taxaRealCentavos)))
      .orderBy(desc(sql`abs(${pedidos.taxaRealCentavos} - ${pedidos.taxaEstimadaCentavos})`))
      .limit(10),
    db
      .select({
        id: pecas.id,
        titulo: pecas.titulo,
        sku: pecas.sku,
        preco: pecas.precoCentavos,
        criadoEm: pecas.criadoEm,
        foto: sql<string | null>`(select ${fotosPeca.url} from ${fotosPeca} where ${fotosPeca.pecaId} = ${pecas.id} order by ${fotosPeca.ordem} limit 1)`,
        url: sql<string | null>`(select ${anuncios.url} from ${anuncios} where ${anuncios.pecaId} = ${pecas.id} and ${anuncios.situacao} = 'ativo' limit 1)`,
      })
      .from(pecas)
      .where(and(eq(pecas.contaId, conta.id), eq(pecas.situacao, "disponivel"), lt(pecas.criadoEm, new Date(Date.now() - DIAS_PARADO * 86_400_000))))
      .orderBy(asc(pecas.criadoEm))
      .limit(10),
    db.select({ n: count() }).from(tarefas).where(and(eq(tarefas.contaId, conta.id), eq(tarefas.situacao, "aberta"))),
  ]);

  const ticket = kpi.n ? Math.round(kpi.vendido / kpi.n) : 0;
  const margem = kpi.vendido ? Math.round((kpi.lucro / kpi.vendido) * 100) : 0;

  // série diária com os dias sem venda
  const mapa = new Map(porDia.map((d) => [d.dia, Number(d.valor)]));
  const serie = Array.from({ length: dias }, (_, i) => {
    const d = new Date(Date.now() - (dias - 1 - i) * 86_400_000);
    const chave = d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    return { chave, valor: mapa.get(chave) ?? 0 };
  });
  const maxDia = Math.max(1, ...serie.map((s) => s.valor));
  const maxCanal = Math.max(1, ...porCanal.map((c) => Math.abs(Number(c.lucro))));

  const todo: { tom: string; titulo: string; detalhe: string; href: string; acao: string }[] = [];
  if (abertas.n) todo.push({ tom: "red", titulo: `${abertas.n} ${abertas.n === 1 ? "tarefa aberta" : "tarefas abertas"}`, detalhe: "Etiquetas, envios e taxas para conferir.", href: "/tarefas", acao: "Ver tarefas" });
  if (parados.length) todo.push({ tom: "", titulo: `${parados.length} ${parados.length === 1 ? "peça parada" : "peças paradas"} há mais de ${DIAS_PARADO} dias`, detalhe: "Baixar o preço ou republicar costuma devolver o anúncio às buscas.", href: "#parados", acao: "Ver" });
  const difs = taxas.filter((t) => Math.abs((t.real ?? 0) - (t.estimada ?? 0)) > 50);
  if (difs.length) todo.push({ tom: "", titulo: `${difs.length} ${difs.length === 1 ? "taxa veio diferente" : "taxas vieram diferentes"} da estimada`, detalhe: "Confira a categoria e o tipo de anúncio.", href: "#taxas", acao: "Ver" });
  if (!todo.length) todo.push({ tom: "ok", titulo: "Tudo em dia", detalhe: "Nenhuma pendência agora.", href: "/estoque", acao: "Estoque" });

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">Resultados</p>
          <h1>Command Center</h1>
          <p className="sub">
            Últimos {dias} dias · todos os canais conectados
          </p>
        </div>
        <div className="seg" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <Link
              key={p}
              href={p === 30 ? "/resultados" : `/resultados?dias=${p}`}
              aria-pressed={dias === p}
              style={{ padding: "6px 12px", fontSize: ".84rem", fontWeight: dias === p ? 600 : 500, textDecoration: "none", background: dias === p ? "var(--sunk)" : undefined, color: dias === p ? "var(--ink)" : "var(--muted)" }}
            >
              {p} dias
            </Link>
          ))}
        </div>
      </header>

      <div className="cck">
        <div className="kp">
          <small>Vendido</small>
          <b>{reais(kpi.vendido)}</b>
          <div className="d">
            {kpi.n} {kpi.n === 1 ? "pedido" : "pedidos"}
          </div>
        </div>
        <div className={`kp${kpi.lucro < 0 ? " alert" : ""}`}>
          <small>Lucro</small>
          <b>{reais(kpi.lucro)}</b>
          <div className="d">margem de {margem}%</div>
        </div>
        <div className="kp">
          <small>Ticket médio</small>
          <b>{reais(ticket)}</b>
          <div className="d">por pedido</div>
        </div>
        <div className={`kp${abertas.n ? " alert" : ""}`}>
          <small>Tarefas abertas</small>
          <b>{abertas.n}</b>
          <div className="d">{abertas.n ? "esperando você" : "nada pendente"}</div>
        </div>
      </div>

      <div className="cc2">
        <div className="panel">
          <div className="ph">
            <h2>Mais vendidos</h2>
          </div>
          {top.length === 0 ? (
            <p className="muted">Nenhuma venda no período.</p>
          ) : (
            <div className="tw">
              <table className="rk">
                <tbody>
                  <tr>
                    <th>Peça</th>
                    <th className="num">Vendas</th>
                    <th className="num">Vendido</th>
                    <th className="num">Lucro</th>
                  </tr>
                  {top.map((t) => (
                    <tr key={t.sku}>
                      <td className="item">
                        {t.titulo}
                        <span className="sub2">{t.sku}</span>
                      </td>
                      <td className="num">{t.n}</td>
                      <td className="num">{reais(Number(t.vendido))}</td>
                      <td className={`num ${Number(t.lucro) < 0 ? "neg" : ""}`}>{reais(Number(t.lucro))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="panel">
          <h2>O que fazer agora</h2>
          {todo.map((t) => (
            <div className="todo" key={t.titulo}>
              <span className={`dot ${t.tom}`} />
              <div>
                {t.titulo}
                <small>{t.detalhe}</small>
              </div>
              <Link className="btn small" href={t.href}>
                {t.acao}
              </Link>
            </div>
          ))}
        </div>
      </div>

      <div className="two" style={{ marginTop: 18 }}>
        <div className="panel chart">
          <h2>Vendas por dia</h2>
          <p className="muted" style={{ fontSize: ".8rem" }}>Valor bruto</p>
          <svg viewBox={`0 0 ${dias * 10} 120`} role="img" aria-label="Vendas por dia" preserveAspectRatio="none" style={{ height: 160, marginTop: 8 }}>
            <line x1="0" y1="110" x2={dias * 10} y2="110" stroke="var(--line)" />
            {serie.map((s, i) => {
              const h = (s.valor / maxDia) * 100;
              return (
                <rect key={s.chave} x={i * 10 + 1.5} y={110 - h} width={7} height={Math.max(h, s.valor ? 1 : 0)} rx={1.5} fill="var(--accent)">
                  <title>{`${s.chave.split("-").reverse().slice(0, 2).join("/")}: ${reais(s.valor)}`}</title>
                </rect>
              );
            })}
          </svg>
        </div>
        <div className="panel">
          <h2>Lucro por canal</h2>
          <p className="muted" style={{ fontSize: ".8rem" }}>Depois de taxas e custo da peça</p>
          <div className="hbars">
            {porCanal.length === 0 && <p className="muted">Sem vendas no período.</p>}
            {porCanal.map((c) => (
              <div className="hb" key={c.canal} style={{ ["--c" as string]: `var(--c-${CANAIS[c.canal as Canal].cor})` }}>
                <span>{CANAIS[c.canal as Canal].nome}</span>
                <div className="track">
                  <div className="fill" style={{ width: `${(Math.abs(Number(c.lucro)) / maxCanal) * 100}%` }} />
                </div>
                <span className={`num ${Number(c.lucro) < 0 ? "neg" : ""}`} style={{ textAlign: "right" }}>
                  {reais(Number(c.lucro))}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel" id="taxas" style={{ marginTop: 18 }}>
        <h2>Taxas: estimado × real</h2>
        <p className="muted" style={{ fontSize: ".84rem" }}>Estimado = tabela do canal no anúncio. Real = o que o marketplace informou no pedido. Confirmado = o repasse.</p>
        {taxas.length === 0 ? (
          <p className="muted" style={{ marginTop: 8 }}>Ainda não há pedidos com as duas taxas. As estimativas entram nos anúncios criados pelo Plist.</p>
        ) : (
          <div className="tw">
            <table className="rk">
              <tbody>
                <tr>
                  <th>Pedido</th>
                  <th>Canal</th>
                  <th className="num">Estimada</th>
                  <th className="num">Real</th>
                  <th className="num">Confirmada</th>
                  <th className="num">Diferença</th>
                </tr>
                {taxas.map((t) => {
                  const dif = (t.real ?? 0) - (t.estimada ?? 0);
                  return (
                    <tr key={t.idExterno}>
                      <td className="item">
                        {t.titulo ?? "—"}
                        <span className="sub2 mono">#{t.idExterno}</span>
                      </td>
                      <td>{CANAIS[t.canal].nome}</td>
                      <td className="num">{reais(t.estimada)}</td>
                      <td className="num">{reais(t.real)}</td>
                      <td className="num muted">{reais(t.confirmada)}</td>
                      <td className="num">
                        <span className={`dchip ${Math.abs(dif) <= 50 ? "eq" : dif > 0 ? "up" : "down"}`}>
                          {dif > 0 ? "+" : dif < 0 ? "−" : ""}
                          {reais(Math.abs(dif))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel" id="parados" style={{ marginTop: 18 }}>
        <h2>Parados há muito tempo</h2>
        <p className="muted" style={{ fontSize: ".84rem" }}>Disponíveis há {DIAS_PARADO} dias ou mais sem vender.</p>
        {parados.length === 0 ? (
          <p className="muted" style={{ marginTop: 8 }}>Nenhuma peça parada. Bom sinal.</p>
        ) : (
          <ul className="stale">
            {parados.map((p) => (
              <li key={p.id}>
                <div className="thumb" style={{ ["--h" as string]: 210 }}>
                  {p.foto ? <img src={p.foto} alt="" loading="lazy" /> : p.titulo.slice(0, 1)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{p.titulo}</div>
                  <span className="muted" style={{ fontSize: ".8rem" }}>
                    {p.sku} · {reais(p.preco)} · {Math.floor((Date.now() - p.criadoEm.getTime()) / 86_400_000)} dias
                  </span>
                </div>
                {p.url ? (
                  <a className="btn small" href={p.url} target="_blank" rel="noreferrer">
                    Ver anúncio
                  </a>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h2>Comparar preços e perguntar sobre o mercado</h2>
        <p className="muted" style={{ fontSize: ".84rem", marginTop: 4 }}>
          Seu preço contra anúncios parecidos e perguntas ao Claude sobre o que está vendendo. <span className="pill p-muted">Em breve</span>
        </p>
      </div>
    </>
  );
}
