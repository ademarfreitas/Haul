import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { campanhaEnvios, campanhas } from "@/db/schema";
import { reais } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";
import { categoriasPorCliente, clienteProprio, clientesComMedidas, retornoDasCampanhas, temCrm } from "@/lib/crm";
import { descreveFiltro, filtraClientes, JANELA_RETORNO, linkZap, preenche } from "@/lib/crm-funil";
import { SEGMENTOS } from "@/lib/crm-medidas";
import { Vitrine } from "../../vitrine";
import { Enviar } from "../formulario";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campanha · CRM · Plist" };

export default async function Campanha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { conta } = await exigirConta(`/crm/campanhas/${id}`);
  if (!temCrm(conta)) return <Vitrine />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const db = obterDb();
  const [[c], envios, { clientes }, categorias, retorno] = await Promise.all([
    db.select().from(campanhas).where(and(eq(campanhas.id, id), eq(campanhas.contaId, conta.id))),
    db.select({ clienteId: campanhaEnvios.clienteId, em: campanhaEnvios.enviadoEm }).from(campanhaEnvios).where(eq(campanhaEnvios.campanhaId, id)),
    clientesComMedidas(conta.id),
    categoriasPorCliente(conta.id),
    retornoDasCampanhas(conta.id, JANELA_RETORNO),
  ]);
  if (!c) notFound();

  const enviados = new Map(envios.map((e) => [e.clienteId, e.em]));
  const doGrupo = filtraClientes(clientes, c.filtro, categorias);
  const proprios = doGrupo.filter(clienteProprio);
  const deMarketplace = doGrupo.length - proprios.length;
  const semZap = proprios.filter((x) => !x.whatsapp).length;
  const semAceite = c.tipo === "oferta" ? proprios.filter((x) => x.whatsapp && !x.ofertas).length : 0;
  // quem já recebeu continua na lista, mesmo que tenha mudado de segmento
  const fila = [
    ...proprios.filter((x) => x.whatsapp && (c.tipo === "relacionamento" || x.ofertas)),
    ...clientes.filter((x) => enviados.has(x.id) && !proprios.some((p) => p.id === x.id)),
  ]
    .map((x) => {
      const msg = preenche(c.mensagem, { nome: x.nome, empresa: conta.nome });
      return { ...x, msg, zap: linkZap(x.whatsapp, msg)!, enviado: enviados.has(x.id) };
    })
    .filter((x) => x.zap)
    .sort((a, b) => Number(a.enviado) - Number(b.enviado) || b.totalCentavos - a.totalCentavos);
  const r = retorno.get(c.id);

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">
            <Link href="/crm/campanhas">Campanhas</Link>
          </p>
          <h1>
            #{c.numero} {c.nome}{" "}
            <span className={`pill ${c.tipo === "oferta" ? "p-accent" : "p-muted"}`} style={{ verticalAlign: "middle" }}>
              {c.tipo === "oferta" ? "Oferta" : "Relacionamento"}
            </span>
          </h1>
          <p className="sub">{descreveFiltro(c.filtro)}</p>
        </div>
      </header>
      <div className="stats">
        <div className="stat">
          <p className="eyebrow">Na lista</p>
          <div className="v">{fila.length}</div>
        </div>
        <div className="stat">
          <p className="eyebrow">Enviadas</p>
          <div className="v">{r?.enviados ?? 0}</div>
        </div>
        <div className="stat">
          <p className="eyebrow">Compraram em {JANELA_RETORNO} dias</p>
          <div className="v">{r?.compraram ?? 0}</div>
        </div>
        <div className="stat">
          <p className="eyebrow">Vendido</p>
          <div className="v">{reais(r?.vendido ?? 0)}</div>
        </div>
      </div>
      <div className="panel">
        <h2>Mensagem</h2>
        <p style={{ whiteSpace: "pre-wrap", fontSize: ".9rem", marginTop: 6 }}>{c.mensagem}</p>
        {(deMarketplace > 0 || semZap > 0 || semAceite > 0) && (
          <p className="muted" style={{ fontSize: ".82rem", marginTop: 8 }}>
            Ficaram de fora:{" "}
            {[
              deMarketplace && `${deMarketplace} de marketplace (o canal não deixa)`,
              semZap && `${semZap} sem WhatsApp`,
              semAceite && `${semAceite} que não aceitaram ofertas`,
            ]
              .filter(Boolean)
              .join(", ")}
            .
          </p>
        )}
      </div>
      <div className="tablewrap" style={{ marginTop: 14 }}>
        <table>
          <tbody>
            <tr>
              <th>Cliente</th>
              <th>Segmento</th>
              <th className="num">Já comprou</th>
              <th>Enviar</th>
            </tr>
            {fila.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 28 }}>
                  Ninguém no grupo com WhatsApp{c.tipo === "oferta" ? " e aceite de ofertas" : ""}. Cadastre o WhatsApp e o aceite na ficha dos seus clientes próprios.
                </td>
              </tr>
            )}
            {fila.map((x) => (
              <tr key={x.id}>
                <td className="item">
                  <Link href={`/crm/${x.id}`}>{x.nome}</Link>
                  <span className="sub2" style={{ maxWidth: 420, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {x.msg}
                  </span>
                </td>
                <td>
                  <span className={`pill ${SEGMENTOS[x.segmento].pilula}`}>{SEGMENTOS[x.segmento].um}</span>
                </td>
                <td className="num">{reais(x.totalCentavos)}</td>
                <td>
                  <Enviar campanha={c.id} cliente={x.id} zap={x.zap} enviado={x.enviado} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
