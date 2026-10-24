import Link from "next/link";
import { and, eq, gte, isNull, or } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { oportunidades } from "@/db/schema";
import { reais } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";
import { clientesComMedidas, ligarPedidosAClientes, temCrm } from "@/lib/crm";
import { ETAPAS, resumoDoFunil } from "@/lib/crm-funil";
import { acoesDoDia, type Acao } from "@/lib/crm-hoje";
import { diaSP, ORDEM_SEGMENTOS, SEGMENTOS, somaDias } from "@/lib/crm-medidas";
import { BotaoZap, CabecalhoCrm, dataCurta } from "./partes";
import { Vitrine } from "./vitrine";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM · Plist" };

function Bloco({ titulo, sub, itens }: { titulo: string; sub: string; itens: Acao[] }) {
  if (!itens.length) return null;
  return (
    <div className="panel">
      <h2>{titulo}</h2>
      <p className="muted" style={{ fontSize: ".84rem", marginTop: 2 }}>
        {sub}
      </p>
      <Linhas itens={itens} />
    </div>
  );
}

function Linhas({ itens }: { itens: Acao[] }) {
  return (
    <ol className="tl">
      {itens.map((a) => (
        <li key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <b>{a.nome}</b>
            <span className="sub2" style={{ display: "block" }}>
              {a.detalhe}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "none" }}>
            <BotaoZap zap={a.zap} semZap={a.semZap} />
            <Link className="btn small" href={`/crm/${a.id}`}>
              Ficha
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function Hoje() {
  const { conta } = await exigirConta("/crm");
  if (!temCrm(conta)) return <Vitrine />;

  await ligarPedidosAClientes(conta.id);
  const medidas = await clientesComMedidas(conta.id);
  const hoje = diaSP(new Date());
  const de = somaDias(hoje, -90);
  const [acoes, linhasFunil] = await Promise.all([
    acoesDoDia(conta.id, medidas, conta.nome),
    obterDb()
      .select({
        etapa: oportunidades.etapa,
        valorCentavos: oportunidades.valorCentavos,
        origem: oportunidades.origem,
        motivoPerda: oportunidades.motivoPerda,
        criadoEm: oportunidades.criadoEm,
        fechadoEm: oportunidades.fechadoEm,
        proximaData: oportunidades.proximaData,
      })
      .from(oportunidades)
      .where(and(eq(oportunidades.contaId, conta.id), or(isNull(oportunidades.fechadoEm), gte(oportunidades.fechadoEm, new Date(`${de}T03:00:00Z`))))),
  ]);
  const funil = resumoDoFunil(linhasFunil, { de, ate: hoje, hoje });

  const { clientes, ritmoLoja } = medidas;
  const compram = clientes.filter((c) => c.compras > 0).length;
  const sumindo = clientes.filter((c) => c.segmento === "sumindo");
  const porSegmento = (s: (typeof ORDEM_SEGMENTOS)[number]) => clientes.filter((c) => c.segmento === s).length;

  return (
    <>
      <CabecalhoCrm aba="hoje" contador={acoes.total} sub="Quem chamar hoje, com a mensagem pronta. Tudo calculado das suas vendas, sem digitar nada." />
      <div className="stats">
        <div className="stat">
          <p className="eyebrow">Clientes que compram</p>
          <div className="v">{compram}</div>
          <div className="d">
            de {clientes.length} cadastrados · ritmo típico: a cada {ritmoLoja} dias
          </div>
        </div>
        <div className="stat">
          <p className="eyebrow">Sumindo</p>
          <div className="v">{sumindo.length}</div>
          <div className="d">{reais(sumindo.reduce((s, c) => s + c.ticketCentavos, 0))} em ticket médio em risco</div>
        </div>
        <div className="stat">
          <p className="eyebrow">No funil</p>
          <div className="v">{reais(funil.valorAberto)}</div>
          <div className="d">
            {funil.abertas} {funil.abertas === 1 ? "oportunidade" : "oportunidades"} · previsão {reais(funil.previsto)}
          </div>
        </div>
        <div className="stat">
          <p className="eyebrow">Conversão (90 dias)</p>
          <div className="v">{funil.conversao == null ? "—" : `${funil.conversao}%`}</div>
          <div className="d">
            {funil.ganhas} {funil.ganhas === 1 ? "ganha" : "ganhas"} · {funil.perdidas} {funil.perdidas === 1 ? "perdida" : "perdidas"}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
        {ORDEM_SEGMENTOS.map((s) => (
          <Link key={s} href={`/crm/clientes?seg=${s}`} className="panel" style={{ textDecoration: "none", color: "inherit", margin: 0, padding: "12px 14px" }}>
            <span className={`pill ${SEGMENTOS[s].pilula}`}>{SEGMENTOS[s].rotulo}</span>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: 6 }}>{porSegmento(s)}</div>
            <div className="muted" style={{ fontSize: ".78rem", marginTop: 2 }}>
              {SEGMENTOS[s].acao}
            </div>
          </Link>
        ))}
      </div>

      {acoes.total === 0 && (
        <div className="emptybox">
          <p>Nada para hoje. Quando alguém passar do ritmo de compra, fizer aniversário ou tiver um contato marcado, aparece aqui.</p>
        </div>
      )}

      <Bloco titulo="Contatos marcados" sub="O próximo passo que você marcou na ficha, para hoje ou atrasado." itens={acoes.contatos} />

      {acoes.oportunidades.length > 0 && (
        <div className="panel">
          <h2>Oportunidades esperando você</h2>
          <p className="muted" style={{ fontSize: ".84rem", marginTop: 2 }}>
            Com a ação vencida ou paradas há mais de 5 dias.
          </p>
          <ol className="tl">
            {acoes.oportunidades.map((o) => (
              <li key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <b>
                    #{o.numero} {o.titulo}
                  </b>
                  <span className="sub2" style={{ display: "block" }}>
                    {o.nome} · {ETAPAS[o.etapa].rotulo} · {reais(o.valorCentavos)}
                    {o.proximaData ? ` · ${o.atrasada ? "atrasada desde" : "para"} ${dataCurta(o.proximaData)}` : " · sem próxima ação"}
                    {o.proximaAcao ? `: ${o.proximaAcao}` : ""}
                  </span>
                </div>
                <Link className="btn small" href={`/crm/oportunidades/${o.id}`}>
                  Abrir
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      <Bloco titulo="Aniversários da semana" sub="Uma mensagem no dia faz diferença." itens={acoes.aniversarios} />
      <Bloco titulo="Sumindo: os que mais compram primeiro" sub="Passaram do ritmo de compra de cada um." itens={acoes.sumindo} />

      {acoes.chegou.map((p) => (
        <Bloco key={p.pecaId} titulo={`Chegou: ${p.titulo}`} sub="Quem costuma levar peças assim. Avise antes que outro compre." itens={p.clientes} />
      ))}

      <Bloco titulo="Reconquistar" sub="Clientes que compravam bem e sumiram há mais tempo." itens={acoes.perdidos} />
      <Bloco titulo="Pós-venda" sub="Primeira compra há poucos dias: pergunte se gostou." itens={acoes.novos} />
    </>
  );
}
