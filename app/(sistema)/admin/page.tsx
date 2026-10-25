import Link from "next/link";
import { asc, eq, ne, sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { cobrancas, contas, usuarios } from "@/db/schema";
import { exigirAdmin } from "@/lib/admin";
import { custosDoMes, diasAteVencer, receitaRecorrente, SITUACOES, situacaoDe, vencimento, type Situacao } from "@/lib/assinantes";
import { reais } from "@/lib/canais";
import { PLANOS } from "@/lib/planos";
import { registrarPagamento } from "./acoes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assinantes · Plist", robots: { index: false } };

const FILTROS: { id: string; nome: string; situacoes: Situacao[] }[] = [
  { id: "todos", nome: "Todos", situacoes: [] },
  { id: "teste", nome: "Em teste", situacoes: ["teste"] },
  { id: "em-dia", nome: "Em dia", situacoes: ["em_dia"] },
  { id: "inadimplentes", nome: "Inadimplentes", situacoes: ["inadimplente", "aguardando"] },
  { id: "vencidos", nome: "Venceram sem renovar", situacoes: ["vencida", "nao_converteu"] },
  { id: "cancelados", nome: "Cancelados", situacoes: ["cancelada"] },
];

const data = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const inicioDoMes = sql`date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'`;

// A tabela de cobranças chega com a migração 0003: até ela rodar no banco, o painel mostra o resto e avisa.
async function lerCobrancas() {
  const db = obterDb();
  try {
    const [porConta, doMes] = await Promise.all([
      db
        .select({ contaId: cobrancas.contaId, total: sql<number>`sum(${cobrancas.valorCentavos})::int`, n: sql<number>`count(*)::int` })
        .from(cobrancas)
        .where(eq(cobrancas.situacao, "paga"))
        .groupBy(cobrancas.contaId),
      db
        .select({ valorCentavos: cobrancas.valorCentavos, taxaProvedorCentavos: cobrancas.taxaProvedorCentavos })
        .from(cobrancas)
        .where(sql`${cobrancas.situacao} = 'paga' and ${cobrancas.pagaEm} >= ${inicioDoMes}`),
    ]);
    return { porConta: new Map(porConta.map((p) => [p.contaId, p])), doMes, falta: false };
  } catch (e) {
    // 42P01 = tabela não existe (o drizzle embrulha o erro do banco em `cause`)
    const erro = e as { code?: string; cause?: { code?: string } };
    if (erro.code === "42P01" || erro.cause?.code === "42P01") {
      return { porConta: new Map<string, { total: number; n: number }>(), doMes: [], falta: true };
    }
    throw e;
  }
}

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const eu = await exigirAdmin("/admin");
  const pedido = (await searchParams).f;
  const filtro = FILTROS.find((x) => x.id === pedido) ?? FILTROS[0];
  const db = obterDb();
  const agora = new Date();

  // dono = primeiro usuário da conta (quem fez o cadastro); nomes escritos por extenso porque na subconsulta
  // o drizzle não põe o nome da tabela na coluna
  const dono = (campo: "nome" | "email") =>
    sql<string | null>`(select u.${sql.identifier(campo)} from usuarios u where u.conta_id = contas.id order by u.criado_em limit 1)`;
  const [lista, cob] = await Promise.all([
    db
      .select({
        id: contas.id,
        conta: contas.nome,
        nome: dono("nome"),
        email: dono("email"),
        plano: contas.plano,
        situacaoAssinatura: contas.situacaoAssinatura,
        testeAte: contas.testeAte,
        pagoAte: contas.pagoAte,
        criadoEm: contas.criadoEm,
      })
      .from(contas)
      .where(ne(contas.id, eu.conta.id)) // a conta do próprio dono fica de fora
      .orderBy(asc(contas.criadoEm)),
    lerCobrancas(),
  ]);

  const todas = lista.map((c) => ({ ...c, situacao: situacaoDe(c, agora), vence: vencimento(c), dias: diasAteVencer(c, agora) }));
  const conta = (s: Situacao[]) => todas.filter((c) => s.includes(c.situacao)).length;
  const entradaMes = cob.doMes.reduce((s, p) => s + p.valorCentavos, 0);
  const entradaTotal = [...cob.porConta.values()].reduce((s, p) => s + Number(p.total), 0);
  const custos = custosDoMes(cob.doMes, todas);
  const mrr = receitaRecorrente(todas);
  const resultado = entradaMes - custos.total;
  const linhas = (filtro.situacoes.length ? todas.filter((c) => filtro.situacoes.includes(c.situacao)) : todas).sort(
    (a, b) => a.vence.getTime() - b.vence.getTime(),
  );
  const porPlano = PLANOS.map((p) => ({ ...p, n: todas.filter((c) => c.plano === p.id && (c.situacao === "em_dia" || c.situacao === "inadimplente")).length }));

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">Administração</p>
          <h1>Assinantes</h1>
          <p className="sub">
            {todas.length} {todas.length === 1 ? "conta cadastrada" : "contas cadastradas"} · só você vê esta página
          </p>
        </div>
      </header>

      {cob.falta && (
        <div className="panel" style={{ borderColor: "var(--warn, #b7791f)", marginBottom: 14 }}>
          <b>Falta criar a tabela de cobranças no banco.</b>
          <p className="muted" style={{ fontSize: ".86rem", marginTop: 4 }}>
            Rode <code>npm run db:migrar</code> na pasta C:\app\haul-novo (depois de <code>git pull</code>). Até lá, entradas e
            pagamentos aparecem zerados.
          </p>
        </div>
      )}

      <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <div className="stat">
          <div className="eyebrow">Entrou este mês</div>
          <div className="v">{reais(entradaMes)}</div>
          <div className="d">{reais(entradaTotal)} desde o início</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Custos do mês (estimados)</div>
          <div className="v">{reais(custos.total)}</div>
          <div className="d" style={{ color: resultado < 0 ? "var(--bad, #c53030)" : undefined }}>
            resultado {reais(resultado)}
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">Receita recorrente</div>
          <div className="v">{reais(mrr)}</div>
          <div className="d">
            {porPlano.map((p) => `${p.n} ${p.nome}`).join(" · ")}
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">Em teste grátis</div>
          <div className="v">{conta(["teste"])}</div>
          <div className="d">
            {todas.filter((c) => c.situacao === "teste" && c.dias <= 7).length} vencem em até 7 dias
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">Inadimplentes</div>
          <div className="v" style={{ color: conta(["inadimplente", "aguardando"]) ? "var(--bad, #c53030)" : undefined }}>
            {conta(["inadimplente", "aguardando"])}
          </div>
          <div className="d">{conta(["vencida", "nao_converteu"])} venceram sem renovar</div>
        </div>
      </div>

      <div className="seg" role="group" aria-label="Filtro" style={{ margin: "18px 0 12px", flexWrap: "wrap" }}>
        {FILTROS.map((x) => {
          const n = x.situacoes.length ? conta(x.situacoes) : todas.length;
          return (
            <Link
              key={x.id}
              href={x.id === "todos" ? "/admin" : `/admin?f=${x.id}`}
              aria-pressed={filtro.id === x.id}
              style={{ padding: "6px 12px", fontSize: ".84rem", fontWeight: filtro.id === x.id ? 600 : 500, textDecoration: "none", background: filtro.id === x.id ? "var(--sunk)" : undefined, color: filtro.id === x.id ? "var(--ink)" : "var(--muted)" }}
            >
              {x.nome} ({n})
            </Link>
          );
        })}
      </div>

      <div className="tablewrap">
        <table>
          <tbody>
            <tr>
              <th>Cliente</th>
              <th>Plano</th>
              <th>Situação</th>
              <th>Vence em</th>
              <th className="num">Já pagou</th>
              <th />
            </tr>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Ninguém nesta situação.
                </td>
              </tr>
            )}
            {linhas.map((c) => {
              const s = SITUACOES[c.situacao];
              const pago = cob.porConta.get(c.id);
              const plano = PLANOS.find((p) => p.id === c.plano);
              return (
                <tr key={c.id}>
                  <td>
                    <b>{c.nome ?? c.conta}</b>
                    <span className="sub2" style={{ display: "block" }}>
                      {c.email ?? "sem usuário"} · desde {data(c.criadoEm)}
                    </span>
                  </td>
                  <td>{plano ? `${plano.nome} · ${reais(plano.precoCentavos)}` : <span className="muted">não escolheu</span>}</td>
                  <td>
                    <span className={`pill p-${s.tom}`}>{s.nome}</span>
                  </td>
                  <td>
                    {data(c.vence)}
                    <span className="sub2" style={{ display: "block" }}>
                      {c.situacao === "cancelada"
                        ? ""
                        : c.dias >= 0
                          ? `${c.pagoAte ? "mensalidade" : "teste"} · ${c.dias === 0 ? "hoje" : `em ${c.dias} ${c.dias === 1 ? "dia" : "dias"}`}`
                          : `${-c.dias} ${c.dias === -1 ? "dia" : "dias"} de atraso`}
                    </span>
                  </td>
                  <td className="num">
                    {reais(Number(pago?.total ?? 0))}
                    {pago && (
                      <span className="sub2" style={{ display: "block" }}>
                        {pago.n} {pago.n === 1 ? "mensalidade" : "mensalidades"}
                      </span>
                    )}
                  </td>
                  <td>
                    {!cob.falta && c.situacao !== "cancelada" && (
                      <details>
                        <summary className="btn small">+ Pagamento</summary>
                        <form action={registrarPagamento} style={{ display: "grid", gap: 6, marginTop: 8, minWidth: 200 }}>
                          <input type="hidden" name="conta" value={c.id} />
                          <select name="plano" defaultValue={c.plano ?? "essencial"} aria-label="Plano">
                            {PLANOS.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nome} · {reais(p.precoCentavos)}
                              </option>
                            ))}
                          </select>
                          <select name="forma" defaultValue="pix" aria-label="Forma de pagamento">
                            <option value="pix">Pix</option>
                            <option value="boleto">Boleto</option>
                            <option value="cartao">Cartão</option>
                            <option value="manual">Outro (sem taxa)</option>
                          </select>
                          <input name="obs" placeholder="Observação (opcional)" maxLength={300} />
                          <button className="btn small primary" type="submit">
                            Confirmar 1 mês
                          </button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <h2>Custos do mês</h2>
        <p className="muted" style={{ fontSize: ".84rem", marginTop: 2 }}>
          Estimativas da planilha de custos (24/10/2026). IA e SMS entram quando forem ligados. Confira com as faturas.
        </p>
        <div style={{ marginTop: 8 }}>
          {[...custos.linhas, { nome: "Total", centavos: custos.total }].map((l) => (
            <div key={l.nome} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderTop: "1px solid var(--line)", fontWeight: l.nome === "Total" ? 700 : undefined }}>
              <span>{l.nome}</span>
              <span className="num">{reais(l.centavos)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
