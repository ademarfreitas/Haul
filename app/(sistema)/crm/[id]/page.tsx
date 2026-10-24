import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { clienteNotas, clientes, pecas, pedidos, usuarios } from "@/db/schema";
import { CANAIS, reais } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";
import { clienteProprio, clientesComMedidas, NAO_CONTA, temCrm } from "@/lib/crm";
import { ORIGENS, SEGMENTOS } from "@/lib/crm-medidas";
import { adicionarNota, removerEtiqueta, salvarProximoPasso } from "../acoes";
import { FormCliente, FormEtiqueta } from "../formularios";
import { dataCurta } from "../partes";
import { Vitrine } from "../vitrine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cliente · CRM · Plist" };

// os valores que mais aparecem, do mais comum para o menos
function maisComuns(valores: (string | null)[], n = 3) {
  const conta = new Map<string, number>();
  for (const v of valores) if (v) conta.set(v, (conta.get(v) ?? 0) + 1);
  return [...conta.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([v]) => v);
}

export default async function Ficha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { conta } = await exigirConta(`/crm/${id}`);
  if (!temCrm(conta)) return <Vitrine />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const db = obterDb();
  const [[cad], { clientes: todos, ritmoLoja }] = await Promise.all([
    db.select().from(clientes).where(and(eq(clientes.id, id), eq(clientes.contaId, conta.id))),
    clientesComMedidas(conta.id),
  ]);
  const c = todos.find((x) => x.id === id);
  if (!cad || !c) notFound();

  const [compras, notas, disponiveis] = await Promise.all([
    db
      .select({
        id: pedidos.id,
        canal: pedidos.canal,
        idExterno: pedidos.idExterno,
        situacao: pedidos.situacao,
        valor: pedidos.valorVendaCentavos,
        vendidoEm: pedidos.vendidoEm,
        titulo: pecas.titulo,
        categoria: pecas.categoria,
        marca: pecas.marca,
        tamanho: pecas.tamanho,
      })
      .from(pedidos)
      .leftJoin(pecas, eq(pecas.id, pedidos.pecaId))
      .where(and(eq(pedidos.contaId, conta.id), eq(pedidos.clienteId, id)))
      .orderBy(desc(pedidos.vendidoEm))
      .limit(100),
    db
      .select({ id: clienteNotas.id, texto: clienteNotas.texto, criadoEm: clienteNotas.criadoEm, autor: usuarios.nome })
      .from(clienteNotas)
      .leftJoin(usuarios, eq(usuarios.id, clienteNotas.usuarioId))
      .where(and(eq(clienteNotas.contaId, conta.id), eq(clienteNotas.clienteId, id)))
      .orderBy(desc(clienteNotas.criadoEm))
      .limit(100),
    db
      .select({ id: pecas.id, titulo: pecas.titulo, categoria: pecas.categoria, marca: pecas.marca, tamanho: pecas.tamanho, preco: pecas.precoCentavos })
      .from(pecas)
      .where(and(eq(pecas.contaId, conta.id), eq(pecas.situacao, "disponivel")))
      .orderBy(desc(pecas.criadoEm))
      .limit(300),
  ]);

  const valem = compras.filter((p) => !(NAO_CONTA as readonly string[]).includes(p.situacao));
  const categorias = maisComuns(valem.map((p) => p.categoria));
  const marcas = maisComuns(valem.map((p) => p.marca));
  const tamanhos = maisComuns(valem.map((p) => p.tamanho));
  // "para oferecer": peças à venda no estilo do que ele compra (brechó: cada peça é única)
  const sugestoes = disponiveis
    .map((p) => ({
      ...p,
      pontos: (p.categoria && categorias.includes(p.categoria) ? 2 : 0) + (p.marca && marcas.includes(p.marca) ? 2 : 0) + (p.tamanho && tamanhos.includes(p.tamanho) ? 1 : 0),
    }))
    .filter((p) => p.pontos >= 2)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 4);

  const linha = [
    ...compras.map((p) => ({
      quando: p.vendidoEm,
      texto: `${(NAO_CONTA as readonly string[]).includes(p.situacao) ? "Pedido não concluído:" : "Comprou"} ${p.titulo ?? "peça fora do estoque"} por ${reais(p.valor)} no ${CANAIS[p.canal].nome}`,
      chave: `p${p.id}`,
    })),
    ...notas.map((n) => ({ quando: n.criadoEm, texto: `${n.autor ? `${n.autor.split(" ")[0]}: ` : ""}${n.texto}`, chave: `n${n.id}` })),
  ].sort((a, b) => b.quando.getTime() - a.quando.getTime());

  const proprio = clienteProprio(cad);
  const seg = SEGMENTOS[c.segmento];
  const dado = (rotulo: string, valor: React.ReactNode) => (
    <div>
      <p className="eyebrow">{rotulo}</p>
      <div style={{ marginTop: 2 }}>{valor || "—"}</div>
    </div>
  );

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">
            <Link href="/crm">CRM</Link>
          </p>
          <h1>
            {c.nome} <span className={`pill ${seg.pilula}`} style={{ verticalAlign: "middle" }}>{seg.um}</span>
            {c.maior && (
              <span className="pill p-accent" style={{ verticalAlign: "middle", marginLeft: 6 }}>
                Top 20%
              </span>
            )}
          </h1>
          <p className="sub">{seg.acao}</p>
        </div>
        {proprio && cad.whatsapp && (
          <a className="btn primary" href={`https://wa.me/${cad.whatsapp}`} target="_blank" rel="noreferrer">
            Chamar no WhatsApp
          </a>
        )}
      </header>

      <div className="panel">
        <h2>Relacionamento</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginTop: 10, fontSize: ".9rem" }}>
          {dado("De onde vem", c.canal ? `Comprador do ${CANAIS[c.canal].nome}` : `Cliente próprio${c.origem ? ` · ${ORIGENS[c.origem as keyof typeof ORIGENS]}` : ""}`)}
          {dado("Compras", `${c.compras} · ${reais(c.totalCentavos)}`)}
          {dado("Ticket médio", c.compras ? reais(c.ticketCentavos) : null)}
          {dado("Ritmo", c.ritmo ? `a cada ${c.ritmo} dias` : c.compras ? `comprou uma vez (a loja: ${ritmoLoja} dias)` : null)}
          {dado("Última compra", c.ultima ? `${dataCurta(c.ultima)} (${c.parado} dias)` : null)}
          {dado("Próxima esperada", c.proxima ? `${dataCurta(c.proxima)}${c.atraso ? ` · ${c.atraso} dias de atraso` : ""}` : null)}
          {dado("Cidade", c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ""}` : null)}
          {dado("Aniversário", c.aniversario ? `${dataCurta(c.aniversario).replace(/ de \d{4}$/, "")}${c.aniversarioEm === 0 ? " · hoje!" : c.aniversarioEm != null && c.aniversarioEm <= 7 ? ` · em ${c.aniversarioEm} dias` : ""}` : null)}
          {proprio && dado("Ofertas", c.ofertas ? "Aceitou receber" : "Não aceitou")}
        </div>
        {!proprio && (
          <p className="muted" style={{ fontSize: ".84rem", marginTop: 12 }}>
            O {c.canal ? CANAIS[c.canal].nome : "canal"} não passa o contato do comprador e não deixa usar os dados dele para oferta fora do canal. Para falar com ele, use a
            conversa do pedido no próprio canal.
          </p>
        )}
      </div>

      <div className="panel">
        <h2>Próximo passo</h2>
        <form action={salvarProximoPasso} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          <input type="hidden" name="id" value={id} />
          <input type="date" name="quando" defaultValue={cad.proximoContato ?? ""} aria-label="Quando" style={{ maxWidth: 170 }} />
          <input name="passo" defaultValue={cad.proximoPasso ?? ""} placeholder="Ex.: avisar quando chegar jeans 38" maxLength={200} aria-label="O que fazer" style={{ flex: 1, minWidth: 200 }} />
          <button className="btn small primary" type="submit">
            Salvar
          </button>
          {(cad.proximoContato || cad.proximoPasso) && (
            <button className="btn small" type="submit" name="limpar" value="1">
              Feito
            </button>
          )}
        </form>
      </div>

      <div className="panel">
        <h2>O que compra</h2>
        {valem.length === 0 ? (
          <p className="muted" style={{ fontSize: ".86rem", marginTop: 6 }}>Ainda sem compras.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginTop: 10, fontSize: ".9rem" }}>
            {dado("Categorias", categorias.join(", "))}
            {dado("Marcas", marcas.join(", "))}
            {dado("Tamanhos", tamanhos.join(", "))}
          </div>
        )}
        {sugestoes.length > 0 && (
          <>
            <p className="eyebrow" style={{ marginTop: 14 }}>
              Para oferecer: à venda no estilo dele
            </p>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: ".9rem" }}>
              {sugestoes.map((p) => (
                <li key={p.id}>
                  {p.titulo} · {reais(p.preco)}
                  <span className="muted"> ({[p.categoria, p.marca, p.tamanho].filter(Boolean).join(", ")})</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Interesses</h2>
        <div className="chips" style={{ marginTop: 8 }}>
          {c.etiquetas.map((e) => (
            <form key={e} action={removerEtiqueta} style={{ display: "contents" }}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="etiqueta" value={e} />
              <button className="chip" type="submit" title="Tirar esta etiqueta">
                {e} ×
              </button>
            </form>
          ))}
          {categorias.map((e) => (
            <span key={`auto-${e}`} className="chip sug" title="Vem das compras">
              {e}
            </span>
          ))}
          {c.etiquetas.length === 0 && categorias.length === 0 && <span className="muted" style={{ fontSize: ".86rem" }}>Nenhum ainda.</span>}
        </div>
        <FormEtiqueta id={id} />
      </div>

      <div className="panel">
        <h2>Linha do tempo</h2>
        <form action={adicionarNota} style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input type="hidden" name="id" value={id} />
          <input name="texto" placeholder="Anotar: o que conversaram, o que procura…" maxLength={1000} required aria-label="Anotação" style={{ flex: 1 }} />
          <button className="btn small" type="submit">
            Anotar
          </button>
        </form>
        <ol className="tl">
          {linha.map((l) => (
            <li key={l.chave}>
              <b>{l.quando.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" })}</b>
              <span>{l.texto}</span>
            </li>
          ))}
        </ol>
      </div>

      {proprio ? (
        <>
          <h2 style={{ margin: "22px 0 10px" }}>Dados do cliente</h2>
          <FormCliente
            c={{
              id,
              nome: cad.nome,
              whatsapp: cad.whatsapp,
              email: cad.email,
              aniversario: cad.aniversario,
              origem: cad.origem,
              ofertas: cad.ofertasAceiteEm != null,
              ofertasOrigem: cad.ofertasOrigem,
            }}
          />
        </>
      ) : null}
    </>
  );
}
