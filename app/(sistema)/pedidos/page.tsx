import Link from "next/link";
import { and, count, desc, eq, inArray, sum } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { pecas, pedidos } from "@/db/schema";
import { CANAIS, reais } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";
import { AtualizarPedidos } from "../_partes/atualizar-pedidos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Pedidos · Plist" };

const ESTADOS = {
  enviar: { nome: "A enviar", situacoes: ["pago", "pronto_para_envio"] },
  transito: { nome: "Em trânsito", situacoes: ["enviado"] },
  entregues: { nome: "Entregues", situacoes: ["entregue"] },
  cancelados: { nome: "Cancelados", situacoes: ["cancelado", "devolvido", "aguardando_pagamento"] },
  todos: { nome: "Todos", situacoes: [] },
} as const;
type Estado = keyof typeof ESTADOS;

const PILULA: Record<string, [string, string]> = {
  aguardando_pagamento: ["p-muted", "Aguardando pagamento"],
  pago: ["p-warn", "Pago"],
  pronto_para_envio: ["p-warn", "Pronto para enviar"],
  enviado: ["p-accent", "Em trânsito"],
  entregue: ["p-good", "Entregue"],
  cancelado: ["p-bad", "Cancelado"],
  devolvido: ["p-bad", "Devolvido"],
};

type Dados = { logistica?: string; envioId?: number | null } | null;

export default async function Pedidos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { conta } = await exigirConta("/pedidos");
  const p = await searchParams;
  const estado: Estado = p.estado && Object.hasOwn(ESTADOS, p.estado) ? (p.estado as Estado) : "enviar";

  const db = obterDb();
  const porSituacao = await db
    .select({ situacao: pedidos.situacao, n: count(), valor: sum(pedidos.valorVendaCentavos) })
    .from(pedidos)
    .where(eq(pedidos.contaId, conta.id))
    .groupBy(pedidos.situacao);
  const situacoes = ESTADOS[estado].situacoes as readonly string[];
  const lista = await db
    .select({
      id: pedidos.id,
      canal: pedidos.canal,
      idExterno: pedidos.idExterno,
      situacao: pedidos.situacao,
      comprador: pedidos.compradorNome,
      cidade: pedidos.cidade,
      uf: pedidos.uf,
      valor: pedidos.valorVendaCentavos,
      taxaEstimada: pedidos.taxaEstimadaCentavos,
      taxaReal: pedidos.taxaRealCentavos,
      rastreio: pedidos.codigoRastreio,
      dados: pedidos.dadosBrutos,
      vendidoEm: pedidos.vendidoEm,
      titulo: pecas.titulo,
      sku: pecas.sku,
      custo: pecas.custoCentavos,
    })
    .from(pedidos)
    .leftJoin(pecas, eq(pecas.id, pedidos.pecaId))
    .where(and(eq(pedidos.contaId, conta.id), situacoes.length ? inArray(pedidos.situacao, situacoes as ("pago" | "enviado")[]) : undefined))
    .orderBy(desc(pedidos.vendidoEm))
    .limit(200);

  const total = porSituacao.reduce((s, x) => s + x.n, 0);
  const vendido = porSituacao.filter((x) => x.situacao !== "cancelado").reduce((s, x) => s + Number(x.valor ?? 0), 0);
  const nDe = (e: Estado) => (e === "todos" ? total : porSituacao.filter((x) => (ESTADOS[e].situacoes as readonly string[]).includes(x.situacao)).reduce((s, x) => s + x.n, 0));
  const quando = (d: Date) => {
    const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    return dias === 0 ? "Hoje" : dias === 1 ? "Ontem" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });
  };

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">Todos os canais, uma fila</p>
          <h1>Pedidos</h1>
          <p className="sub">
            {total} {total === 1 ? "pedido" : "pedidos"} · {reais(vendido)} vendidos nos últimos 60 dias
          </p>
        </div>
        <AtualizarPedidos primario />
      </header>
      <div className="ordbar">
        <div className="chips">
          {(Object.keys(ESTADOS) as Estado[]).map((k) => (
            <Link key={k} className="chip" href={k === "enviar" ? "/pedidos" : `/pedidos?estado=${k}`} aria-pressed={estado === k}>
              {ESTADOS[k].nome} <span className="mono">{nDe(k)}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="tablewrap">
        <table>
          <tbody>
            <tr>
              <th>Data</th>
              <th>Pedido</th>
              <th>Peça</th>
              <th>Canal</th>
              <th>Comprador</th>
              <th>Envio</th>
              <th className="num">Vendido por</th>
              <th className="num">Taxa</th>
              <th className="num">Custo</th>
              <th className="num">Lucro</th>
              <th>Situação</th>
              <th>Etiqueta</th>
            </tr>
            {lista.length === 0 && (
              <tr>
                <td colSpan={12} className="muted" style={{ textAlign: "center", padding: 28 }}>
                  {total === 0 ? "Nenhum pedido ainda. Clique em Atualizar pedidos para trazer as vendas do Mercado Livre." : "Nenhum pedido aqui."}
                </td>
              </tr>
            )}
            {lista.map((o) => {
              const d = o.dados as Dados;
              const taxa = o.taxaReal ?? o.taxaEstimada;
              const lucro = o.situacao === "cancelado" ? null : o.valor - (taxa ?? 0) - (o.custo ?? 0);
              const dif = o.taxaReal != null && o.taxaEstimada != null ? o.taxaReal - o.taxaEstimada : null;
              const [cls, txt] = PILULA[o.situacao];
              return (
                <tr key={o.id}>
                  <td>{quando(o.vendidoEm)}</td>
                  <td className="mono muted">#{o.idExterno}</td>
                  <td className="item">
                    {o.titulo ?? "Peça fora do estoque do Plist"}
                    <span className="sub2">{o.sku ?? "sem SKU"}</span>
                  </td>
                  <td>
                    <span className="chb st-live" style={{ ["--c" as string]: `var(--c-${CANAIS[o.canal].cor})` }}>{CANAIS[o.canal].sigla}</span> {CANAIS[o.canal].nome}
                  </td>
                  <td>
                    {o.comprador ?? "—"}
                    {o.cidade && <span className="sub2">{o.cidade}{o.uf ? `/${o.uf}` : ""}</span>}
                  </td>
                  <td>
                    {d?.logistica || "—"}
                    {o.rastreio && <span className="sub2 mono">{o.rastreio}</span>}
                  </td>
                  <td className="num">{reais(o.valor)}</td>
                  <td className="num">
                    {taxa != null ? `−${reais(taxa).replace("R$", "").trim()}` : "—"}
                    {dif != null && Math.abs(dif) > 50 && <span className={`dchip ${dif > 0 ? "up" : "down"}`}>{dif > 0 ? "+" : "−"}{reais(Math.abs(dif))} vs. estimada</span>}
                    {o.taxaReal == null && o.taxaEstimada != null && <span className="sub2">estimada</span>}
                  </td>
                  <td className="num muted">{o.custo != null ? `−${reais(o.custo).replace("R$", "").trim()}` : "—"}</td>
                  <td className={`num ${lucro != null && lucro < 0 ? "neg" : ""}`}>{lucro != null ? <b>{reais(lucro)}</b> : "—"}</td>
                  <td>
                    <span className={`pill ${cls}`}>{txt}</span>
                  </td>
                  <td>
                    {o.canal === "mercado_livre" && d?.envioId && d.logistica !== "Full" && ["pronto_para_envio", "enviado"].includes(o.situacao) ? (
                      <a className={`btn small${o.situacao === "pronto_para_envio" ? " primary" : ""}`} href={`/api/canais/mercado-livre/etiqueta?pedido=${o.id}`} target="_blank" rel="noreferrer">
                        {o.situacao === "pronto_para_envio" ? "Imprimir" : "Reimprimir"}
                      </a>
                    ) : o.canal === "shopee" && d?.logistica !== "Full" && ["pago", "pronto_para_envio", "enviado"].includes(o.situacao) ? (
                      <a
                        className={`btn small${o.situacao === "enviado" ? "" : " primary"}`}
                        href={`/api/canais/shopee/etiqueta?pedido=${o.id}${o.situacao === "pago" ? "&organizar=1" : ""}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {o.situacao === "pago" ? "Organizar envio" : o.situacao === "pronto_para_envio" ? "Imprimir" : "Reimprimir"}
                      </a>
                    ) : (
                      <span className="muted" style={{ fontSize: ".8rem" }}>
                        {d?.logistica === "Full" ? (o.canal === "shopee" ? "Full: a Shopee envia" : "Full: o ML envia") : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: ".8rem", marginTop: 10 }}>
        A taxa aparece em três momentos: estimada pela tabela no anúncio, real quando o pedido chega e confirmada no repasse. O lucro desconta a taxa e o
        custo que você informou na peça.
      </p>
    </>
  );
}
