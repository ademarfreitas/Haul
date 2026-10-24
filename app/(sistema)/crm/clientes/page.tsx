import Link from "next/link";
import { CANAIS, reais } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";
import { clientesComMedidas, ligarPedidosAClientes, temCrm } from "@/lib/crm";
import { ORDEM_SEGMENTOS, SEGMENTOS, type Segmento } from "@/lib/crm-medidas";
import { CabecalhoCrm, dataCurta } from "../partes";
import { Vitrine } from "../vitrine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clientes · CRM · Plist" };

export default async function Clientes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { conta } = await exigirConta("/crm/clientes");
  if (!temCrm(conta)) return <Vitrine />;
  const p = await searchParams;
  const seg = p.seg && Object.hasOwn(SEGMENTOS, p.seg) ? (p.seg as Segmento) : null;
  const q = (p.q ?? "").trim().toLowerCase().slice(0, 60);

  await ligarPedidosAClientes(conta.id);
  const { clientes } = await clientesComMedidas(conta.id);

  const comCompra = clientes.filter((c) => c.compras > 0);
  const voltaram = comCompra.filter((c) => c.compras >= 2).length;
  const vendido = comCompra.reduce((s, c) => s + c.totalCentavos, 0);
  const nVendas = comCompra.reduce((s, c) => s + c.compras, 0);
  const porSegmento = (s: Segmento) => clientes.filter((c) => c.segmento === s).length;
  const lista = clientes
    .filter((c) => (!seg || c.segmento === seg) && (!q || c.nome.toLowerCase().includes(q) || c.etiquetas.some((e) => e.includes(q))))
    .sort((a, b) => (b.ultima ?? "").localeCompare(a.ultima ?? "") || a.nome.localeCompare(b.nome))
    .slice(0, 300);
  const link = (s: Segmento | null) => `/crm/clientes${s ? `?seg=${s}` : ""}`;

  return (
    <>
      <CabecalhoCrm
        aba="clientes"
        sub="Quem compra de você, em todos os canais. Os compradores do Mercado Livre e da Shopee entram sozinhos a cada pedido."
        acoes={
          <>
            <a className="btn" href="/crm/clientes.csv">
              Planilha
            </a>
            <Link className="btn" href="/crm/novo">
              Novo cliente
            </Link>
          </>
        }
      />
      <div className="stats">
        <div className="stat">
          <p className="eyebrow">Clientes</p>
          <div className="v">{clientes.length}</div>
        </div>
        <div className="stat">
          <p className="eyebrow">Compraram de novo</p>
          <div className="v">{voltaram}</div>
          <div className="d">{comCompra.length ? `${Math.round((voltaram / comCompra.length) * 100)}% de quem comprou` : "—"}</div>
        </div>
        <div className="stat">
          <p className="eyebrow">Ticket médio</p>
          <div className="v">{nVendas ? reais(Math.round(vendido / nVendas)) : "—"}</div>
        </div>
        <div className="stat">
          <p className="eyebrow">Sumindo ou perdidos</p>
          <div className="v">{porSegmento("sumindo") + porSegmento("perdido")}</div>
          <div className="d">passaram do ritmo de compra</div>
        </div>
      </div>
      <div className="ordbar">
        <div className="chips">
          <Link className="chip" href={link(null)} aria-pressed={!seg}>
            Todos <span className="mono">{clientes.length}</span>
          </Link>
          {ORDEM_SEGMENTOS.map((s) => (
            <Link key={s} className="chip" href={link(s)} aria-pressed={seg === s}>
              {SEGMENTOS[s].rotulo} <span className="mono">{porSegmento(s)}</span>
            </Link>
          ))}
        </div>
        <form action="/crm/clientes" role="search" style={{ display: "flex", gap: 6 }}>
          {seg && <input type="hidden" name="seg" value={seg} />}
          <input type="search" name="q" defaultValue={q} placeholder="Nome ou etiqueta" aria-label="Buscar cliente" style={{ maxWidth: 200 }} />
        </form>
      </div>
      {seg && <p className="muted" style={{ fontSize: ".86rem", margin: "0 0 10px" }}>{SEGMENTOS[seg].acao}</p>}
      <div className="tablewrap">
        <table>
          <tbody>
            <tr>
              <th>Cliente</th>
              <th>Canal</th>
              <th>Segmento</th>
              <th className="num">Pedidos</th>
              <th className="num">Total</th>
              <th>Última compra</th>
              <th>Próxima esperada</th>
            </tr>
            {lista.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 28 }}>
                  {clientes.length === 0 ? (
                    <>
                      Nenhum cliente ainda. Eles aparecem aqui quando chegam pedidos do Mercado Livre ou da Shopee (veja em <Link href="/pedidos">Pedidos</Link>), ou
                      cadastre os seus clientes próprios em <Link href="/crm/novo">Novo cliente</Link>.
                    </>
                  ) : (
                    "Nenhum cliente aqui."
                  )}
                </td>
              </tr>
            )}
            {lista.map((c) => (
              <tr key={c.id}>
                <td className="item">
                  <Link href={`/crm/${c.id}`}>{c.nome}</Link>
                  {c.maior && (
                    <span className="pill p-accent" style={{ marginLeft: 6 }}>
                      Top 20%
                    </span>
                  )}
                  {(c.cidade || c.etiquetas.length > 0) && (
                    <span className="sub2">{[c.cidade && `${c.cidade}${c.uf ? `/${c.uf}` : ""}`, ...c.etiquetas].filter(Boolean).join(" · ")}</span>
                  )}
                </td>
                <td>
                  {c.canal ? (
                    <>
                      <span className="chb st-live" style={{ ["--c" as string]: `var(--c-${CANAIS[c.canal].cor})` }}>{CANAIS[c.canal].sigla}</span> {CANAIS[c.canal].nome}
                    </>
                  ) : (
                    "Cliente próprio"
                  )}
                </td>
                <td>
                  <span className={`pill ${SEGMENTOS[c.segmento].pilula}`}>{SEGMENTOS[c.segmento].um}</span>
                </td>
                <td className="num">{c.compras}</td>
                <td className="num">{reais(c.totalCentavos)}</td>
                <td>{dataCurta(c.ultima)}</td>
                <td>
                  {dataCurta(c.proxima)}
                  {c.atraso > 0 && <span className="sub2" style={{ color: "var(--warn)" }}>{c.atraso} dias de atraso</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
