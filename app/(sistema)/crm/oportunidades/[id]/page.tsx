import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { clientes, oportunidadeEventos, oportunidades, usuarios } from "@/db/schema";
import { reais } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";
import { clienteProprio, temCrm } from "@/lib/crm";
import { ABERTAS, aberta, ETAPAS, linkZap, MODELOS, MOTIVOS_PERDA, preenche } from "@/lib/crm-funil";
import { ORIGENS } from "@/lib/crm-medidas";
import { anotarOportunidade, moverOportunidade } from "../../acoes-funil";
import { BotaoZap, dataCurta } from "../../partes";
import { Vitrine } from "../../vitrine";
import { FormOportunidade } from "../formulario";

export const dynamic = "force-dynamic";
export const metadata = { title: "Oportunidade · CRM · Plist" };

export default async function Oportunidade({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const { conta } = await exigirConta(`/crm/oportunidades/${id}`);
  if (!temCrm(conta)) return <Vitrine />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const perder = (await searchParams).perder === "1";

  const db = obterDb();
  const [linha] = await db
    .select({ o: oportunidades, cliente: { id: clientes.id, nome: clientes.nome, canal: clientes.canal, whatsapp: clientes.whatsapp } })
    .from(oportunidades)
    .leftJoin(clientes, eq(clientes.id, oportunidades.clienteId))
    .where(and(eq(oportunidades.id, id), eq(oportunidades.contaId, conta.id)));
  if (!linha) notFound();
  const { o, cliente } = linha;
  const eventos = await db
    .select({ id: oportunidadeEventos.id, de: oportunidadeEventos.de, para: oportunidadeEventos.para, texto: oportunidadeEventos.texto, criadoEm: oportunidadeEventos.criadoEm, autor: usuarios.nome })
    .from(oportunidadeEventos)
    .leftJoin(usuarios, eq(usuarios.id, oportunidadeEventos.usuarioId))
    .where(eq(oportunidadeEventos.oportunidadeId, o.id))
    .orderBy(asc(oportunidadeEventos.criadoEm));

  const nome = cliente?.nome ?? o.contatoNome ?? "—";
  const whatsapp = cliente ? (clienteProprio(cliente) ? cliente.whatsapp : null) : o.contatoWhatsapp;
  const zap = linkZap(whatsapp, preenche(MODELOS.contato, { nome, empresa: conta.nome }));
  const estaAberta = aberta(o.etapa);
  const pilula = o.etapa === "ganho" ? "p-good" : o.etapa === "perdido" ? "p-bad" : "p-accent";
  const mover = (para: string, rotulo: string, primario = false) => (
    <form action={moverOportunidade} key={para}>
      <input type="hidden" name="id" value={o.id} />
      <input type="hidden" name="para" value={para} />
      <input type="hidden" name="volta" value="oportunidade" />
      <button className={`btn small${primario ? " primary" : ""}`} type="submit">
        {rotulo}
      </button>
    </form>
  );

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">
            <Link href="/crm/funil">Funil de vendas</Link>
          </p>
          <h1>
            #{o.numero} {o.titulo}{" "}
            <span className={`pill ${pilula}`} style={{ verticalAlign: "middle" }}>
              {ETAPAS[o.etapa].rotulo}
            </span>
          </h1>
          <p className="sub">
            {cliente ? <Link href={`/crm/${cliente.id}`}>{nome}</Link> : `${nome} (contato sem cadastro)`} · {reais(o.valorCentavos)}
            {o.origem ? ` · veio de ${ORIGENS[o.origem]}` : ""}
            {o.proximaData ? ` · próxima ação ${dataCurta(o.proximaData)}${o.proximaAcao ? `: ${o.proximaAcao}` : ""}` : ""}
          </p>
        </div>
        <BotaoZap zap={zap} semZap={cliente && !clienteProprio(cliente) ? "fale pela conversa do pedido no canal" : "sem WhatsApp"} />
      </header>

      <div className="panel">
        <h2>{estaAberta ? "Mover" : "Fechada"}</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {estaAberta ? (
            <>
              {ABERTAS.filter((e) => e !== o.etapa).map((e) => mover(e, ETAPAS[e].rotulo))}
              {mover("ganho", "Ganhou", true)}
            </>
          ) : (
            <>
              <span className="muted" style={{ fontSize: ".86rem", alignSelf: "center" }}>
                {o.etapa === "perdido" && o.motivoPerda ? `Motivo: ${MOTIVOS_PERDA[o.motivoPerda]}${o.motivoTexto ? ` (${o.motivoTexto})` : ""}.` : "Fechou."}
              </span>
              {mover("negociacao", "Reabrir")}
            </>
          )}
        </div>
        {estaAberta && (
          <details open={perder} style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontSize: ".9rem" }}>Perdeu? Conte o motivo</summary>
            <form action={moverOportunidade} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="para" value="perdido" />
              <input type="hidden" name="volta" value="oportunidade" />
              <select name="motivo" required defaultValue="" aria-label="Motivo">
                <option value="" disabled>
                  Por que não fechou?
                </option>
                {Object.entries(MOTIVOS_PERDA).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input name="motivoTexto" placeholder="Detalhe (opcional)" maxLength={300} style={{ flex: 1, minWidth: 180 }} />
              <button className="btn small" type="submit" style={{ color: "var(--bad)" }}>
                Marcar como perdida
              </button>
            </form>
            <p className="muted" style={{ fontSize: ".8rem", marginTop: 4 }}>
              O motivo vira o gráfico "Por que perdemos" no funil.
            </p>
          </details>
        )}
      </div>

      {estaAberta && (
        <>
          <h2 style={{ margin: "22px 0 10px" }}>Editar</h2>
          <FormOportunidade
            clientes={[]}
            o={{
              id: o.id,
              clienteId: o.clienteId,
              contatoNome: o.contatoNome,
              contatoWhatsapp: o.contatoWhatsapp,
              titulo: o.titulo,
              valor: (o.valorCentavos / 100).toFixed(2).replace(".", ","),
              etapa: o.etapa,
              origem: o.origem,
              proximaAcao: o.proximaAcao,
              proximaData: o.proximaData,
            }}
          />
        </>
      )}

      <div className="panel" style={{ marginTop: 14 }}>
        <h2>Histórico</h2>
        <form action={anotarOportunidade} style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input type="hidden" name="id" value={o.id} />
          <input name="texto" placeholder="Anotar: o que conversaram…" maxLength={300} required aria-label="Anotação" style={{ flex: 1 }} />
          <button className="btn small" type="submit">
            Anotar
          </button>
        </form>
        <ol className="tl">
          {[...eventos].reverse().map((e) => (
            <li key={e.id}>
              <b>{e.criadoEm.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" })}</b>
              <span>
                {e.autor ? `${e.autor.split(" ")[0]}: ` : ""}
                {e.de && e.de !== e.para ? `${ETAPAS[e.de].rotulo} → ${ETAPAS[e.para].rotulo}${e.texto ? `. ${e.texto}` : ""}` : e.texto === "criada" ? `Criada em ${ETAPAS[e.para].rotulo}` : e.texto}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
