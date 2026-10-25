import Link from "next/link";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { clientes } from "@/db/schema";
import { CANAIS } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";
import { temCrm } from "@/lib/crm";
import { DE } from "@/lib/crm-captacao";
import { qrSvg } from "@/lib/qr";
import { CabecalhoCrm } from "../partes";
import { Vitrine } from "../vitrine";
import { captacaoDaConta } from "./acoes";
import { Copiar, FormCupom } from "./formulario";

export const dynamic = "force-dynamic";
export const metadata = { title: "Captação · CRM · Plist" };

export default async function Captacao() {
  const { conta } = await exigirConta("/crm/captacao");
  if (!temCrm(conta)) return <Vitrine />;

  const { codigo, cupom, beneficio } = await captacaoDaConta(conta.id);
  const base = (process.env.APP_URL || "https://app.plist.com.br").replace(/\/$/, "");
  const links = { loja: `${base}/c/${codigo}`, pacote: `${base}/c/${codigo}?de=pacote` };
  const [qrLoja, qrPacote] = await Promise.all([qrSvg(links.loja), qrSvg(links.pacote)]);

  const origens = Object.values(DE).map((d) => d.origem);
  const db = obterDb();
  const daCaptacao = and(eq(clientes.contaId, conta.id), inArray(clientes.ofertasOrigem, origens));
  const [[numeros], ultimos] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        mes: sql<number>`count(*) filter (where ${clientes.ofertasAceiteEm} >= now() - interval '30 days')::int`,
        pacote: sql<number>`count(*) filter (where ${clientes.ofertasOrigem} = ${DE.pacote.origem})::int`,
      })
      .from(clientes)
      .where(daCaptacao),
    db
      .select({ id: clientes.id, nome: clientes.nome, canal: clientes.canal, origem: clientes.ofertasOrigem, em: clientes.ofertasAceiteEm })
      .from(clientes)
      .where(and(daCaptacao, gte(clientes.ofertasAceiteEm, new Date(Date.now() - 90 * 86_400_000))))
      .orderBy(desc(clientes.ofertasAceiteEm))
      .limit(10),
  ]);

  const Qr = ({ svg, rotulo }: { svg: string; rotulo: string }) => (
    <div role="img" aria-label={rotulo} style={{ width: 132, height: 132, flex: "none", border: "1px solid var(--line)", borderRadius: 10, padding: 6, background: "#fff" }} dangerouslySetInnerHTML={{ __html: svg }} />
  );

  return (
    <>
      <CabecalhoCrm
        aba="captacao"
        sub="O marketplace não passa o contato de quem compra. Aqui o próprio comprador deixa o WhatsApp e aceita receber novidades, e passa a entrar nas suas campanhas."
      />

      <div className="stats">
        <div className="stat">
          <p className="eyebrow">Cadastros</p>
          <div className="v">{numeros.total}</div>
          <div className="d">desde o começo</div>
        </div>
        <div className="stat">
          <p className="eyebrow">Últimos 30 dias</p>
          <div className="v">{numeros.mes}</div>
          <div className="d">pela página e pelo cartão</div>
        </div>
        <div className="stat">
          <p className="eyebrow">Pelo cartão do pacote</p>
          <div className="v">{numeros.pacote}</div>
          <div className="d">compradores que viraram contato</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        <div className="panel" style={{ margin: 0 }}>
          <h2>Página da loja</h2>
          <p className="muted" style={{ fontSize: ".84rem", marginTop: 2 }}>
            Para a bio do Instagram, o status do WhatsApp, o balcão, a sacola da venda direta e o Facebook. Mostra o cupom.
          </p>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <Qr svg={qrLoja} rotulo="QR code da página da loja" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: ".86rem", wordBreak: "break-all", margin: "0 0 8px" }}>
                <a href={links.loja} target="_blank" rel="noreferrer">
                  {links.loja}
                </a>
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Copiar texto={links.loja} />
                <a className="btn small" href="/imprimir/cartao?de=loja" target="_blank" rel="noreferrer">
                  Imprimir cartões
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="panel" style={{ margin: 0 }}>
          <h2>Cartão para o pacote</h2>
          <p className="muted" style={{ fontSize: ".84rem", marginTop: 2 }}>
            Vai dentro do pacote de qualquer canal. Só agradece e convida a receber novidades, sem cupom e sem oferta para comprar fora: o Mercado Livre e
            a Shopee proíbem tirar a venda da plataforma.
          </p>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <Qr svg={qrPacote} rotulo="QR code do cartão do pacote" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: ".86rem", wordBreak: "break-all", margin: "0 0 8px" }}>
                <a href={links.pacote} target="_blank" rel="noreferrer">
                  {links.pacote}
                </a>
              </p>
              <a className="btn small primary" href="/imprimir/cartao?de=pacote" target="_blank" rel="noreferrer">
                Imprimir cartões
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <h2>Cupom de boas-vindas</h2>
        <p className="muted" style={{ fontSize: ".84rem", marginTop: 2 }}>
          Aparece para quem se cadastra pela página da loja, nunca pelo cartão do pacote. Sem cupom, a página convida só para receber novidades.
        </p>
        <div style={{ marginTop: 10 }}>
          <FormCupom cupom={cupom} beneficio={beneficio} />
        </div>
      </div>

      <div className="panel">
        <h2>Quem se cadastrou (90 dias)</h2>
        {ultimos.length === 0 ? (
          <p className="muted" style={{ fontSize: ".86rem", marginTop: 6 }}>
            Ninguém ainda. Comece pelo cartão no pacote e pelo link na bio do Instagram.
          </p>
        ) : (
          <ol className="tl">
            {ultimos.map((u) => (
              <li key={u.id}>
                <b>{u.em?.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" })}</b>
                <span>
                  <Link href={`/crm/${u.id}`}>{u.nome}</Link>
                  <span className="muted">
                    {" "}
                    · {u.origem}
                    {u.canal && u.canal !== "venda_direta" ? ` · já comprou no ${CANAIS[u.canal].nome}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="panel">
        <h2>Boas práticas</h2>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: ".9rem", lineHeight: 1.6 }}>
          <li>Não mande o link pela conversa do pedido no Mercado Livre ou na Shopee: o canal pune quem leva o comprador para fora.</li>
          <li>No pacote, o cartão agradece e convida a seguir a loja. Cupom e preço especial ficam para quem chega pelos seus canais.</li>
          <li>Quem pedir para sair: abra a ficha e use "Tirar o aceite". O Plist apaga o WhatsApp, o e-mail e o aniversário.</li>
          <li>Comprador do marketplace que põe o número do pedido entra junto com o histórico de compras dele.</li>
        </ul>
      </div>
    </>
  );
}
