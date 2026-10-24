import Link from "next/link";
import { and, count, eq, max, notInArray, sql, sum } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { clientes, pedidos } from "@/db/schema";
import { CANAIS, reais } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";
import { ligarPedidosAClientes, temCrm } from "@/lib/crm";
import { Vitrine } from "./vitrine";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM · Plist" };

const NAO_CONTA: ("cancelado" | "devolvido" | "aguardando_pagamento")[] = ["cancelado", "devolvido", "aguardando_pagamento"];

export default async function Crm() {
  const { conta } = await exigirConta("/crm");
  if (!temCrm(conta)) return <Vitrine />;

  await ligarPedidosAClientes(conta.id);
  const db = obterDb();
  const lista = await db
    .select({
      id: clientes.id,
      nome: clientes.nome,
      canal: clientes.canal,
      cidade: clientes.cidade,
      uf: clientes.uf,
      pedidos: count(pedidos.id),
      total: sum(pedidos.valorVendaCentavos),
      ultima: max(pedidos.vendidoEm),
    })
    .from(clientes)
    .leftJoin(pedidos, and(eq(pedidos.clienteId, clientes.id), notInArray(pedidos.situacao, NAO_CONTA)))
    .where(eq(clientes.contaId, conta.id))
    .groupBy(clientes.id)
    .orderBy(sql`max(${pedidos.vendidoEm}) desc nulls last`)
    .limit(300);

  const voltaram = lista.filter((c) => c.pedidos >= 2).length;
  const comCompra = lista.filter((c) => c.pedidos > 0);
  const vendido = comCompra.reduce((s, c) => s + Number(c.total ?? 0), 0);
  const nVendas = comCompra.reduce((s, c) => s + c.pedidos, 0);
  const quando = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" }) : "—");

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">Plano Avançado</p>
          <h1>CRM</h1>
          <p className="sub">Quem compra de você, em todos os canais. Os compradores do Mercado Livre e da Shopee entram sozinhos a cada pedido.</p>
        </div>
      </header>
      <div className="stats">
        <div className="stat">
          <p className="eyebrow">Clientes</p>
          <div className="v">{lista.length}</div>
        </div>
        <div className="stat">
          <p className="eyebrow">Compraram de novo</p>
          <div className="v">{voltaram}</div>
          <div className="d">{comCompra.length ? `${Math.round((voltaram / comCompra.length) * 100)}% dos clientes` : "—"}</div>
        </div>
        <div className="stat">
          <p className="eyebrow">Ticket médio</p>
          <div className="v">{nVendas ? reais(Math.round(vendido / nVendas)) : "—"}</div>
        </div>
        <div className="stat">
          <p className="eyebrow">Vendido para eles</p>
          <div className="v">{reais(vendido)}</div>
        </div>
      </div>
      <div className="tablewrap">
        <table>
          <tbody>
            <tr>
              <th>Cliente</th>
              <th>Canal</th>
              <th>Cidade</th>
              <th className="num">Pedidos</th>
              <th className="num">Total</th>
              <th>Última compra</th>
            </tr>
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 28 }}>
                  Nenhum cliente ainda. Eles aparecem aqui quando chegam pedidos do Mercado Livre ou da Shopee; veja em <Link href="/pedidos">Pedidos</Link>.
                </td>
              </tr>
            )}
            {lista.map((c) => (
              <tr key={c.id}>
                <td className="item">{c.nome}</td>
                <td>
                  {c.canal ? (
                    <>
                      <span className="chb st-live" style={{ ["--c" as string]: `var(--c-${CANAIS[c.canal].cor})` }}>{CANAIS[c.canal].sigla}</span> {CANAIS[c.canal].nome}
                    </>
                  ) : (
                    "Cliente próprio"
                  )}
                </td>
                <td>{c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ""}` : "—"}</td>
                <td className="num">{c.pedidos}</td>
                <td className="num">{reais(Number(c.total ?? 0))}</td>
                <td>{quando(c.ultima)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
