import Link from "next/link";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, sum, type SQL } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, fotosPeca, pecas } from "@/db/schema";
import { CANAIS, reais, type Canal } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";

export const dynamic = "force-dynamic";
export const metadata = { title: "Estoque · Plist" };

const POR_PAGINA = 60;
const CANAIS_ESTOQUE = (Object.keys(CANAIS) as Canal[]).filter((c) => c !== "venda_direta");

const FILTROS = [
  { id: "todas", nome: "Todas" },
  { id: "disponivel", nome: "Disponíveis" },
  { id: "rascunho", nome: "Rascunhos" },
  { id: "vendida", nome: "Vendidas" },
  { id: "arquivada", nome: "Arquivadas" },
] as const;
type Filtro = (typeof FILTROS)[number]["id"];

const PILULA = {
  rascunho: ["p-muted", "Rascunho"],
  disponivel: ["p-good", "Disponível"],
  reservada: ["p-warn", "Tirando dos canais"],
  vendida: ["p-accent", "Vendida"],
  arquivada: ["p-muted", "Arquivada"],
} as const;

// situação do anúncio → classe do selo do canal (sistema.css: .chb.st-*)
const SELO: Record<string, string> = {
  ativo: "st-live",
  publicando: "st-busy",
  removendo: "st-busy",
  pausado: "st-delisted",
  removido: "st-delisted",
  rascunho: "st-none",
  vendido: "st-sold",
  erro: "st-error",
};
const SITUACAO_ANUNCIO: Record<string, string> = {
  ativo: "no ar",
  publicando: "publicando",
  removendo: "tirando do ar",
  pausado: "pausado",
  removido: "fora do ar",
  rascunho: "rascunho",
  vendido: "vendido",
  erro: "com erro",
};

type AnuncioLinha = { pecaId: string; canal: Canal; situacao: string; url: string | null };

// canais com tela de publicar uma peça do estoque pelo selo
const PUBLICAR: Partial<Record<Canal, string>> = { mercado_livre: "/novo-anuncio", shopee: "/novo-anuncio/shopee", shein: "/novo-anuncio/shein", amazon: "/novo-anuncio/amazon", magalu: "/novo-anuncio/magalu" };

// publicar: id da peça e os canais conectados onde dá para publicá-la pelo selo
function Selos({ lista, publicar }: { lista: AnuncioLinha[]; publicar?: { pecaId: string; canais: Canal[] } }) {
  return (
    <div className="chans">
      {CANAIS_ESTOQUE.map((c) => {
        const a = lista.find((x) => x.canal === c);
        const podePublicar = !a && PUBLICAR[c] && publicar?.canais.includes(c);
        const titulo = `${CANAIS[c].nome}: ${a ? SITUACAO_ANUNCIO[a.situacao] : podePublicar ? "publicar" : "não anunciado"}`;
        const selo = (
          <span className={`chb ${a ? SELO[a.situacao] : "st-none"}`} style={{ ["--c" as string]: `var(--c-${CANAIS[c].cor})` }} title={titulo} aria-label={titulo}>
            {CANAIS[c].sigla}
          </span>
        );
        const destino = a?.url ?? (podePublicar ? `${PUBLICAR[c]}?peca=${publicar!.pecaId}` : null);
        return destino ? (
          <a key={c} href={destino} target={a ? "_blank" : undefined} rel="noreferrer" style={{ textDecoration: "none" }}>
            {selo}
          </a>
        ) : (
          <span key={c}>{selo}</span>
        );
      })}
    </div>
  );
}

function Miniatura({ foto, titulo, grande }: { foto?: string; titulo: string; grande?: boolean }) {
  // sem foto: a inicial sobre um degradê, como no protótipo
  const h = [...titulo].reduce((s, ch) => (s + ch.charCodeAt(0)) % 360, 0);
  return (
    <div className={`thumb${grande ? " lg" : ""}`} style={{ ["--h" as string]: h, ...(grande ? { width: "100%", height: "100%", borderRadius: 0 } : {}) }}>
      {foto ? <img src={foto} alt="" loading="lazy" /> : titulo.slice(0, 1).toUpperCase()}
    </div>
  );
}

const dias = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));

export default async function Estoque({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { conta } = await exigirConta("/estoque");
  const p = await searchParams;
  const q = (p.q ?? "").trim().slice(0, 100);
  const filtro: Filtro = FILTROS.some((f) => f.id === p.filtro) ? (p.filtro as Filtro) : "todas";
  const modo = p.modo === "lista" ? "lista" : "fotos";
  const pagina = Math.max(1, Number.parseInt(p.pagina ?? "1", 10) || 1);

  const db = obterDb();
  const busca: SQL | undefined = q
    ? or(ilike(pecas.titulo, `%${q}%`), ilike(pecas.sku, `%${q}%`), ilike(pecas.marca, `%${q}%`))
    : undefined;
  const condicao = and(eq(pecas.contaId, conta.id), busca, filtro === "todas" ? undefined : eq(pecas.situacao, filtro));

  const conectados = [
    ...new Set(
      (
        await db
          .select({ canal: conexoesCanal.canal })
          .from(conexoesCanal)
          .where(and(eq(conexoesCanal.contaId, conta.id), eq(conexoesCanal.situacao, "ativa")))
      ).map((c) => c.canal),
    ),
  ];
  // rascunho (veio do fornecedor, ainda sem foto) começa pelo ML, onde as fotos sobem; os outros canais usam as fotos dela
  const publicar = (it: { id: string; situacao: string }) =>
    it.situacao === "disponivel" ? { pecaId: it.id, canais: conectados } : it.situacao === "rascunho" ? { pecaId: it.id, canais: conectados.filter((c) => c === "mercado_livre") } : undefined;
  const [porSituacao, [noAr], [{ total }], linhas] = await Promise.all([
    db
      .select({ situacao: pecas.situacao, n: count(), valor: sum(sql`${pecas.precoCentavos} * ${pecas.quantidade}`), unidades: sum(pecas.quantidade) })
      .from(pecas)
      .where(eq(pecas.contaId, conta.id))
      .groupBy(pecas.situacao),
    db.select({ n: count() }).from(anuncios).where(and(eq(anuncios.contaId, conta.id), eq(anuncios.situacao, "ativo"))),
    db.select({ total: count() }).from(pecas).where(condicao),
    db
      .select({
        id: pecas.id,
        sku: pecas.sku,
        titulo: pecas.titulo,
        marca: pecas.marca,
        tamanho: pecas.tamanho,
        precoCentavos: pecas.precoCentavos,
        quantidade: pecas.quantidade,
        situacao: pecas.situacao,
        criadoEm: pecas.criadoEm,
      })
      .from(pecas)
      .where(condicao)
      .orderBy(desc(pecas.criadoEm), asc(pecas.sku))
      .limit(POR_PAGINA)
      .offset((pagina - 1) * POR_PAGINA),
  ]);

  const ids = linhas.map((l) => l.id);
  const [listaAnuncios, listaFotos] = ids.length
    ? await Promise.all([
        db
          .select({ pecaId: anuncios.pecaId, canal: anuncios.canal, situacao: anuncios.situacao, url: anuncios.url })
          .from(anuncios)
          .where(inArray(anuncios.pecaId, ids)),
        db
          .select({ pecaId: fotosPeca.pecaId, url: fotosPeca.url, ordem: fotosPeca.ordem })
          .from(fotosPeca)
          .where(inArray(fotosPeca.pecaId, ids))
          .orderBy(asc(fotosPeca.ordem)),
      ])
    : [[], []];
  const fotosDe = (id: string) => listaFotos.filter((f) => f.pecaId === id);
  const anunciosDe = (id: string) => listaAnuncios.filter((a) => a.pecaId === id) as AnuncioLinha[];

  const contagem = Object.fromEntries(porSituacao.map((s) => [s.situacao, s]));
  const nTotal = porSituacao.reduce((s, x) => s + x.n, 0);
  const disp = contagem.disponivel;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const link = (mudar: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const v = { q: q || undefined, filtro: filtro === "todas" ? undefined : filtro, modo: modo === "fotos" ? undefined : modo, ...mudar };
    for (const [k, x] of Object.entries(v)) if (x !== undefined && x !== "" && !(k === "pagina" && String(x) === "1")) u.set(k, String(x));
    const s = u.toString();
    return s ? `/estoque?${s}` : "/estoque";
  };

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">Um cadastro, vários canais de venda</p>
          <h1>Estoque</h1>
        </div>
        <div className="actions">
          <Link className="btn" href="/inventario">Sincronizar</Link>
          <Link className="btn" href="/estoque/importar">Importar do fornecedor</Link>
          <Link className="btn primary" href="/novo-anuncio">Novo anúncio</Link>
        </div>
      </header>

      <div className="stats">
        <div className="stat">
          <div className="eyebrow">Anúncios no ar</div>
          <div className="v">{noAr.n}</div>
          <div className="d">{disp?.n ?? 0} {disp?.n === 1 ? "peça disponível" : "peças disponíveis"}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Estoque a preço de venda</div>
          <div className="v">{reais(Number(disp?.valor ?? 0))}</div>
          <div className="d">{Number(disp?.unidades ?? 0)} unidades</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Vendidas</div>
          <div className="v">{contagem.vendida?.n ?? 0}</div>
          <div className="d">desde que você entrou no Plist</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Peças cadastradas</div>
          <div className="v">{nTotal}</div>
          <div className="d">{contagem.rascunho?.n ? `${contagem.rascunho.n} em rascunho` : "nenhum rascunho"}</div>
        </div>
      </div>

      <form className="toolbar" action="/estoque">
        <input className="search" type="search" name="q" defaultValue={q} placeholder="Buscar por título, marca ou SKU" aria-label="Buscar no estoque" />
        {filtro !== "todas" && <input type="hidden" name="filtro" value={filtro} />}
        {modo !== "fotos" && <input type="hidden" name="modo" value={modo} />}
        <div className="chips">
          {FILTROS.map((f) => (
            <Link key={f.id} className="chip" href={link({ filtro: f.id === "todas" ? undefined : f.id, pagina: undefined })} aria-pressed={filtro === f.id} style={{ textDecoration: "none" }}>
              {f.nome}
              {f.id !== "todas" && contagem[f.id] ? ` · ${contagem[f.id].n}` : ""}
            </Link>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Visualização">
          <Link href={link({ modo: "lista" })} aria-pressed={modo === "lista"} style={{ all: "unset", cursor: "pointer", padding: "6px 12px", fontSize: ".84rem", fontWeight: modo === "lista" ? 600 : 500, background: modo === "lista" ? "var(--sunk)" : undefined }}>
            Lista
          </Link>
          <Link href={link({ modo: undefined })} aria-pressed={modo === "fotos"} style={{ all: "unset", cursor: "pointer", padding: "6px 12px", fontSize: ".84rem", fontWeight: modo === "fotos" ? 600 : 500, background: modo === "fotos" ? "var(--sunk)" : undefined }}>
            Fotos
          </Link>
        </div>
      </form>

      {nTotal === 0 ? (
        <div className="emptybox">
          <p>Seu estoque está vazio.</p>
          <p style={{ marginTop: 8 }}>
            Traga os anúncios do Mercado Livre, da Shopee e da Shein em <Link href="/inventario">Inventário</Link> ou cadastre uma peça em{" "}
            <Link href="/novo-anuncio">Novo anúncio</Link>.
          </p>
        </div>
      ) : modo === "fotos" ? (
        <div className="gallery" role="list">
          {linhas.length === 0 && <div className="empty">Nada encontrado. Limpe a busca ou troque o filtro.</div>}
          {linhas.map((it) => {
            const fs = fotosDe(it.id);
            const [cls, txt] = PILULA[it.situacao];
            return (
              <div className="card" role="listitem" key={it.id} style={{ cursor: "default" }}>
                <div className="ph">
                  <Miniatura foto={fs[0]?.url} titulo={it.titulo} grande />
                  <span className={`pill ${cls}`}>{txt}</span>
                  {!fs.length && <span className="nophoto">Sem foto ainda</span>}
                  {fs.length > 1 && <span className="nphotos">{fs.length} fotos</span>}
                </div>
                <div className="cb">
                  <div className="t">{it.titulo}</div>
                  <span className="tag" style={{ alignSelf: "flex-start" }}>{it.sku}</span>
                  <Selos lista={anunciosDe(it.id)} publicar={publicar(it)} />
                  <div className="pr">
                    <b className="num">{reais(it.precoCentavos)}</b>
                    <span className="num muted" style={{ fontSize: ".78rem" }}>{dias(it.criadoEm)}d</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="list" role="list">
          <div className="lhead">
            <span></span>
            <span></span>
            <span>Peça</span>
            <span>Canais</span>
            <span className="r">Preço</span>
            <span className="r">Quantidade</span>
            <span className="r">Idade</span>
          </div>
          {linhas.length === 0 && <div className="empty">Nada encontrado. Limpe a busca ou troque o filtro.</div>}
          {linhas.map((it) => {
            const [cls, txt] = PILULA[it.situacao];
            return (
              <div className="row" role="listitem" key={it.id} style={{ cursor: "default" }}>
                <span></span>
                <Miniatura foto={fotosDe(it.id)[0]?.url} titulo={it.titulo} />
                <div style={{ minWidth: 0 }}>
                  <div className="t">{it.titulo}</div>
                  <div className="meta">
                    <span className="tag">{it.sku}</span>
                    {it.marca && <span>{it.marca}</span>}
                    {it.tamanho && <span>{it.tamanho}</span>}
                    <span className={`pill ${cls}`}>{txt}</span>
                  </div>
                </div>
                <Selos lista={anunciosDe(it.id)} publicar={publicar(it)} />
                <div className="r num">{reais(it.precoCentavos)}</div>
                <div className="r num">{it.quantidade}</div>
                <div className="r num muted">{dias(it.criadoEm)}d</div>
              </div>
            );
          })}
        </div>
      )}

      {paginas > 1 && (
        <div className="rowend">
          <span className="muted">
            Página {pagina} de {paginas} · {total} peças
          </span>
          <div className="actions">
            {pagina > 1 && <Link className="btn small" href={link({ pagina: pagina - 1 })}>Anterior</Link>}
            {pagina < paginas && <Link className="btn small" href={link({ pagina: pagina + 1 })}>Próxima</Link>}
          </div>
        </div>
      )}
    </>
  );
}
