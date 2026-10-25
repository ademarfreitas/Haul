import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { contas, indicacoes } from "@/db/schema";
import { reais } from "@/lib/canais";
import { diasDeTeste, exigirConta } from "@/lib/conta";
import { saldoDeIndicacao } from "@/lib/indicacao";
import { descontoIndicacao, DIAS_DE_TOLERANCIA, economiaAnual, MESES_COM_DESCONTO, PLANOS, precoNoCiclo, type Ciclo } from "@/lib/planos";
import { SENHA_MINIMA } from "@/lib/senha";
import { escolherPlano } from "./acoes";
import { Copiar, FormGeral, FormSenha } from "./formularios";

export const dynamic = "force-dynamic";
export const metadata = { title: "Minha conta · Plist" };

const ABAS = [
  ["geral", "Geral"],
  ["plano", "Plano e cobrança"],
  ["indicacao", "Programa de indicação"],
  ["senha", "Senha e segurança"],
] as const;
type Aba = (typeof ABAS)[number][0];

const data = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" });
const somarDias = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

function celular(e164: string | null): string {
  const d = (e164 ?? "").replace(/^\+55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d;
}
// só o meio do documento aparece
function documento(tipo: string | null, doc: string | null): string {
  if (!doc) return "";
  return tipo === "pj"
    ? `${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5, 8)}/${doc.slice(8, 12)}-${doc.slice(12)}`
    : `***.${doc.slice(3, 6)}.${doc.slice(6, 9)}-**`;
}

export default async function MinhaConta({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { conta, usuario } = await exigirConta("/minha-conta");
  const pedido = await searchParams;
  const pedida = pedido.aba;
  const aba: Aba = ABAS.some(([k]) => k === pedida) ? (pedida as Aba) : "geral";

  return (
    <>
      <header className="vhead">
        <div>
          <h1>Minha conta</h1>
        </div>
      </header>
      <div className="tabs" role="tablist">
        {ABAS.map(([k, nome]) => (
          <Link
            key={k}
            href={k === "geral" ? "/minha-conta" : `/minha-conta?aba=${k}`}
            role="tab"
            aria-selected={aba === k}
            style={{ padding: "10px 2px", fontWeight: 600, textDecoration: "none", color: aba === k ? "var(--ink)" : "var(--muted)", borderBottom: `2px solid ${aba === k ? "var(--accent)" : "transparent"}`, marginBottom: -1 }}
          >
            {nome}
          </Link>
        ))}
      </div>
      <div className="acct">
        {aba === "geral" && (
          <>
            <FormGeral
              g={{
                nome: usuario.nome,
                email: usuario.email,
                celular: celular(conta.celular),
                tipo: conta.tipoPessoa === "pj" ? `Pessoa jurídica · ${conta.nome}` : conta.tipoPessoa === "pf" ? "Pessoa física" : "Ainda não informado",
                documento: documento(conta.tipoPessoa, conta.documento),
              }}
            />
            <p className="muted" style={{ fontSize: ".8rem", marginTop: 10 }}>
              Para trocar CPF/CNPJ ou desativar a conta, fale com o suporte.
            </p>
          </>
        )}
        {aba === "plano" && <Plano conta={conta} ver={pedido.ciclo === "anual" || pedido.ciclo === "mensal" ? pedido.ciclo : conta.ciclo} />}
        {aba === "indicacao" && <Indicacao contaId={conta.id} />}
        {aba === "senha" && <FormSenha minimo={SENHA_MINIMA} />}
      </div>
    </>
  );
}

// ver = qual preço os cartões mostram (mensal ou anual); começa no ciclo da conta
async function Plano({ conta, ver }: { conta: Awaited<ReturnType<typeof exigirConta>>["conta"]; ver: Ciclo }) {
  // indicação (entrou por link ou indicou quem pagou): meses que ainda têm 5% de desconto
  const saldo = (await saldoDeIndicacao(conta.id))?.saldo ?? 0;
  const desconto = (p: (typeof PLANOS)[number], c: Ciclo) => descontoIndicacao(p, c, saldo);
  const fim = conta.testeAte;
  const dias = diasDeTeste(fim);
  const escolhido = PLANOS.find((p) => p.id === conta.plano);
  const emTeste = conta.situacaoAssinatura === "teste";
  return (
    <>
      <div className="panel">
        <div className="ph">
          <div>
            <p className="eyebrow">Situação</p>
            <h2 style={{ marginTop: 4 }}>
              {emTeste
                ? dias > 0
                  ? `Teste grátis · ${dias} ${dias === 1 ? "dia restante" : "dias restantes"}`
                  : "Teste encerrado"
                : `Plano ${escolhido?.nome ?? ""}${conta.ciclo === "anual" ? " anual" : ""}`}
            </h2>
          </div>
          <span className={`pill ${conta.situacaoAssinatura === "somente_leitura" ? "p-bad" : emTeste ? "p-accent" : "p-good"}`}>
            {conta.situacaoAssinatura === "somente_leitura" ? "Só leitura" : emTeste ? "Teste" : "Em dia"}
          </span>
        </div>
        <ol className="tl">
          <li className={dias > 0 ? "now" : ""}>
            <b>{data(conta.criadoEm)}</b>
            <span>Conta criada. Tudo liberado por 30 dias, sem cartão.</span>
          </li>
          <li>
            <b>{data(somarDias(fim, -5))}</b>
            <span>Lembrete por e-mail, se ainda não houver forma de pagamento.</span>
          </li>
          <li className={dias === 0 ? "now" : ""}>
            <b>{data(fim)}</b>
            <span>Fim do teste. {escolhido
                ? `Primeira cobrança do plano ${escolhido.nome}${conta.ciclo === "anual" ? " anual" : ""}: ${reais(precoNoCiclo(escolhido, conta.ciclo) - desconto(escolhido, conta.ciclo))}${conta.ciclo === "anual" ? ", vale por 12 meses" : ""}${desconto(escolhido, conta.ciclo) ? ", já com o desconto de indicação" : ""}.`
                : "Primeira cobrança do plano escolhido."}</span>
          </li>
          <li>
            <b>{data(somarDias(fim, DIAS_DE_TOLERANCIA))}</b>
            <span>Sem pagamento em {DIAS_DE_TOLERANCIA} dias, a conta fica só leitura: as vendas continuam chegando, mas não dá para publicar.</span>
          </li>
        </ol>
      </div>
      <div className="panel">
        <h2>Planos</h2>
        <p className="muted" style={{ fontSize: ".84rem" }}>Troque de plano quando quiser. Nada é cobrado durante o teste.</p>
        {saldo > 0 && (
          <p style={{ fontSize: ".84rem", marginTop: 6 }}>
            <span className="pill p-good">Indicação</span> Você tem 5% de desconto {saldo === 1 ? "no próximo mês" : `nos próximos ${saldo} meses`} de plano
            {ver === "anual" ? ` (no anual, sobre ${Math.min(saldo, 12)} dos 12 meses da anuidade)` : ""}.
          </p>
        )}
        <div className="chips" style={{ marginTop: 10 }}>
          {(
            [
              ["mensal", "Mensal"],
              ["anual", "Anual · 2 meses grátis"],
            ] as const
          ).map(([c, nome]) => (
            <Link key={c} className="chip" href={`/minha-conta?aba=plano&ciclo=${c}`} aria-pressed={ver === c} style={{ textDecoration: "none", color: "inherit" }}>
              {nome}
            </Link>
          ))}
        </div>
        <div className="plans">
          {PLANOS.map((p) => {
            const atual = conta.plano === p.id && conta.ciclo === ver;
            return (
            <div key={p.id} className={`plan${atual ? " cur" : ""}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
                <h3>{p.nome}</h3>
                {"selo" in p && <span className="pill p-accent">{p.selo}</span>}
              </div>
              <div className="pr">
                {desconto(p, ver) > 0 && (
                  <s className="muted" style={{ fontSize: ".85rem", fontWeight: 500, marginRight: 6 }}>
                    {reais(precoNoCiclo(p, ver))}
                  </s>
                )}
                {reais(precoNoCiclo(p, ver) - desconto(p, ver))}
                <span className="muted" style={{ fontSize: ".8rem", fontWeight: 500 }}>{ver === "anual" ? " /ano" : " /mês"}</span>
              </div>
              {ver === "anual" && (
                <p className="muted" style={{ fontSize: ".8rem", marginTop: 2 }}>
                  Sai a {reais(Math.round(p.precoAnualCentavos / 12))} por mês · economia de {reais(economiaAnual(p))}
                </p>
              )}
              <ul>
                {p.itens.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
              <form action={escolherPlano}>
                <input type="hidden" name="plano" value={p.id} />
                <input type="hidden" name="ciclo" value={ver} />
                <button className={`btn${atual ? "" : " primary"}`} type="submit" disabled={atual} style={{ width: "100%", justifyContent: "center" }}>
                  {atual ? "Plano escolhido" : conta.plano ? "Trocar para este" : "Escolher"}
                </button>
              </form>
            </div>
            );
          })}
        </div>
      </div>
      <div className="panel">
        <h2>Forma de pagamento</h2>
        <p className="muted" style={{ fontSize: ".84rem", marginTop: 4 }}>
          A cobrança (mensal ou anual, por Pix, boleto ou cartão) entra antes do fim do seu teste. Os dados do cartão serão digitados na página segura do provedor de
          cobrança, nunca no Plist.
        </p>
        <p style={{ marginTop: 10 }}>
          <span className="pill p-muted">Em breve</span>
        </p>
      </div>
    </>
  );
}

async function Indicacao({ contaId }: { contaId: string }) {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const link = `${base}/cadastro?ind=${contaId}`;
  const lista = await obterDb()
    .select({ nome: contas.nome, entrou: indicacoes.criadoEm, situacao: contas.situacaoAssinatura, premio: indicacoes.recompensaConcedidaEm })
    .from(indicacoes)
    .innerJoin(contas, eq(contas.id, indicacoes.indicadaId))
    .where(eq(indicacoes.indicadoraId, contaId))
    .orderBy(desc(indicacoes.criadoEm));
  return (
    <>
      <div className="panel">
        <h2>Indique e ganhe 30 dias e 5% de desconto</h2>
        <p className="muted" style={{ fontSize: ".86rem", marginTop: 4 }}>
          Quem entrar pelo seu link ganha o teste de 30 dias e 5% de desconto nos {MESES_COM_DESCONTO} primeiros meses de plano, no mensal ou no anual. Quando essa
          pessoa pagar a primeira vez, você ganha 30 dias de plano e 5% de desconto nos {MESES_COM_DESCONTO} meses seguintes. Cada indicação que paga soma mais{" "}
          {MESES_COM_DESCONTO} meses de desconto.
        </p>
        <Copiar texto={link} />
      </div>
      <div className="panel">
        <h2>Suas indicações</h2>
        {lista.length === 0 ? (
          <p className="muted" style={{ fontSize: ".86rem", marginTop: 4 }}>Ninguém entrou pelo seu link ainda.</p>
        ) : (
          <div className="tw">
            <table className="wide" style={{ minWidth: 480 }}>
              <tbody>
                <tr>
                  <th>Loja</th>
                  <th>Entrou em</th>
                  <th>Situação</th>
                  <th>Seu prêmio</th>
                </tr>
                {lista.map((i, n) => (
                  <tr key={n}>
                    <td>{i.nome}</td>
                    <td>{i.entrou.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                    <td>{i.situacao === "teste" ? <span className="pill p-accent">Em teste</span> : i.situacao === "ativa" ? <span className="pill p-good">Pagou</span> : <span className="pill p-muted">Sem plano</span>}</td>
                    <td>{i.premio ? `30 dias + 5% por ${MESES_COM_DESCONTO} meses` : "Quando pagar"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
