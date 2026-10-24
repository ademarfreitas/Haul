import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { clientes, oportunidades } from "@/db/schema";
import { reais } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";
import { temCrm } from "@/lib/crm";
import { ETAPAS, MOTIVOS_PERDA, resumoDoFunil, type Etapa, type MotivoPerda } from "@/lib/crm-funil";
import { diaSP, ORIGENS, somaDias } from "@/lib/crm-medidas";
import { CabecalhoCrm, dataCurta } from "../partes";
import { Vitrine } from "../vitrine";
import { Quadro } from "./quadro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Funil de vendas · CRM · Plist" };

export default async function Funil() {
  const { conta } = await exigirConta("/crm/funil");
  if (!temCrm(conta)) return <Vitrine />;
  const hoje = diaSP(new Date());
  const de = somaDias(hoje, -90);
  const desde = (dia: string) => new Date(`${dia}T03:00:00Z`);

  const linhas = await obterDb()
    .select({
      id: oportunidades.id,
      numero: oportunidades.numero,
      titulo: oportunidades.titulo,
      etapa: oportunidades.etapa,
      valorCentavos: oportunidades.valorCentavos,
      origem: oportunidades.origem,
      motivoPerda: oportunidades.motivoPerda,
      criadoEm: oportunidades.criadoEm,
      fechadoEm: oportunidades.fechadoEm,
      proximaData: oportunidades.proximaData,
      nome: sql<string>`coalesce(${clientes.nome}, ${oportunidades.contatoNome})`,
    })
    .from(oportunidades)
    .leftJoin(clientes, eq(clientes.id, oportunidades.clienteId))
    .where(and(eq(oportunidades.contaId, conta.id), or(isNull(oportunidades.fechadoEm), gte(oportunidades.fechadoEm, desde(de)))))
    .orderBy(sql`${oportunidades.proximaData} nulls last`, oportunidades.etapaDesde);

  const r = resumoDoFunil(linhas, { de, ate: hoje, hoje });
  // no quadro, as fechadas dos últimos 30 dias
  const corte = desde(somaDias(hoje, -30));
  const noQuadro = linhas.filter((o) => !o.fechadoEm || o.fechadoEm >= corte);
  const colunas = (Object.keys(ETAPAS) as Etapa[]).map((e) => ({
    id: e,
    nome: ETAPAS[e].rotulo,
    dica: ETAPAS[e].dica,
    total: reais(noQuadro.filter((o) => o.etapa === e).reduce((s, o) => s + o.valorCentavos, 0)),
  }));
  const cartoes = noQuadro.map((o) => ({
    id: o.id,
    numero: o.numero,
    titulo: o.titulo,
    nome: o.nome,
    valor: reais(o.valorCentavos),
    etapa: o.etapa,
    quando: o.proximaData ? dataCurta(o.proximaData) : null,
    atrasada: !!o.proximaData && o.proximaData < hoje && !o.fechadoEm,
  }));
  const maxMotivo = Math.max(1, ...Object.values(r.motivos));

  return (
    <>
      <CabecalhoCrm aba="funil" sub="Quem pediu, quem está negociando e o que fechou. Arraste o cartão para mudar de etapa." />
      <div className="stats">
        <div className="stat">
          <p className="eyebrow">Em aberto</p>
          <div className="v">{reais(r.valorAberto)}</div>
          <div className="d">
            {r.abertas} {r.abertas === 1 ? "oportunidade" : "oportunidades"}
            {r.atrasadas ? ` · ${r.atrasadas} atrasada${r.atrasadas === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <div className="stat">
          <p className="eyebrow">Previsão</p>
          <div className="v">{reais(r.previsto)}</div>
          <div className="d">ponderada pela chance de cada etapa</div>
        </div>
        <div className="stat">
          <p className="eyebrow">Ganhas (90 dias)</p>
          <div className="v">{reais(r.valorGanho)}</div>
          <div className="d">
            {r.ganhas} ganhas · {r.perdidas} perdidas{r.conversao != null ? ` · ${r.conversao}% de conversão` : ""}
          </div>
        </div>
        <div className="stat">
          <p className="eyebrow">Dias até fechar</p>
          <div className="v">{r.diasAteFechar ?? "—"}</div>
          <div className="d">média das ganhas</div>
        </div>
      </div>

      {linhas.length === 0 ? (
        <div className="emptybox">
          <p>Nenhuma oportunidade ainda. Use "+ Oportunidade" quando alguém pedir uma peça, uma encomenda ou um lote no atacado.</p>
        </div>
      ) : (
        <Quadro colunas={colunas} cartoes={cartoes} />
      )}

      {(r.perdidas > 0 || Object.keys(r.porOrigem).length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 18 }}>
          <div className="panel" style={{ margin: 0 }}>
            <h2>Por que perdemos</h2>
            {r.perdidas === 0 ? (
              <p className="muted" style={{ fontSize: ".86rem", marginTop: 6 }}>
                Nenhuma perdida em 90 dias.
              </p>
            ) : (
              (Object.entries(r.motivos) as [MotivoPerda, number][])
                .sort((a, b) => b[1] - a[1])
                .map(([m, n]) => (
                  <div key={m} style={{ marginTop: 8, fontSize: ".86rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{MOTIVOS_PERDA[m]}</span>
                      <b>{n}</b>
                    </div>
                    <div style={{ height: 6, background: "var(--sunk)", borderRadius: 3, marginTop: 3 }}>
                      <div style={{ width: `${(n / maxMotivo) * 100}%`, height: "100%", background: "var(--bad)", borderRadius: 3 }} />
                    </div>
                  </div>
                ))
            )}
          </div>
          <div className="panel" style={{ margin: 0 }}>
            <h2>De onde vêm as vendas</h2>
            {Object.entries(r.porOrigem)
              .sort((a, b) => b[1].valor - a[1].valor)
              .map(([o, x]) => (
                <div key={o} style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8, fontSize: ".86rem" }}>
                  <span>{o === "sem" ? "Sem origem" : ORIGENS[o as keyof typeof ORIGENS]}</span>
                  <span className="muted">
                    {x.ganhas} de {x.ganhas + x.perdidas} fechadas · <b style={{ color: "var(--ink)" }}>{reais(x.valor)}</b>
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  );
}
