import Link from "next/link";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, fotosPeca, pecas } from "@/db/schema";
import { reais } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";
import { ErroShopee, lojaValida } from "@/lib/shopee";
import { fretesShopee, type FreteShopee } from "@/lib/shopee-anuncio";
import { FormularioShopee } from "./formulario";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Publicar na Shopee · Plist" };

async function formasDeEnvio(conexaoId: string): Promise<{ fretes: FreteShopee[]; erro?: string }> {
  try {
    return { fretes: await fretesShopee(await lojaValida(conexaoId)) };
  } catch (e) {
    return {
      fretes: [],
      erro: e instanceof ErroShopee && e.codigo === "reconectar" ? "A autorização da Shopee venceu. Reconecte em Canais." : "Não deu para buscar as formas de envio da loja.",
    };
  }
}

// Publica na Shopee uma peça que já está no estoque (cadastrada aqui ou vinda do Mercado Livre),
// ou uma peça nova (?nova=1) com fotos enviadas direto para a Shopee.
export default async function PublicarShopee({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { conta } = await exigirConta("/novo-anuncio/shopee");
  const { peca: pecaId, nova, publicado } = await searchParams;
  const db = obterDb();

  const lojas = await db
    .select({ id: conexoesCanal.id, apelido: conexoesCanal.apelido, usuarioExterno: conexoesCanal.usuarioExterno })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.contaId, conta.id), eq(conexoesCanal.canal, "shopee"), eq(conexoesCanal.situacao, "ativa")));

  const cabeca = (
    <header className="vhead">
      <div>
        <p className="eyebrow">Mesma peça, mais um canal</p>
        <h1>Publicar na Shopee</h1>
        <p className="sub">Escolha uma peça do estoque (o Plist usa as fotos e os dados dela) ou cadastre uma peça nova só para a Shopee.</p>
      </div>
      <div className="actions">
        <Link className="btn" href="/novo-anuncio/shopee?nova=1">Peça nova</Link>
      </div>
    </header>
  );

  if (!lojas.length) {
    return (
      <>
        {cabeca}
        <div className="emptybox">
          <p>Para publicar, conecte sua loja da Shopee.</p>
          <p style={{ marginTop: 12 }}>
            <a className="btn primary" href="/api/canais/shopee/conectar?voltar=/inventario">Conectar Shopee</a>
          </p>
        </div>
      </>
    );
  }

  // confirmação depois de publicar (a ação redireciona para cá)
  if (publicado && /^[0-9a-f-]{36}$/.test(publicado)) {
    const [a] = await db
      .select({ url: anuncios.url, titulo: anuncios.titulo, sku: pecas.sku })
      .from(anuncios)
      .innerJoin(pecas, eq(pecas.id, anuncios.pecaId))
      .where(and(eq(anuncios.id, publicado), eq(anuncios.contaId, conta.id), eq(anuncios.canal, "shopee")));
    if (a) {
      return (
        <>
          {cabeca}
          <div className="panel" style={{ maxWidth: 640 }}>
            <h2>Publicado na Shopee</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              <span className="tag">{a.sku}</span> {a.titulo}
            </p>
            <div className="actions" style={{ marginTop: 14 }}>
              {a.url && (
                <a className="btn primary" href={a.url} target="_blank" rel="noreferrer">
                  Ver anúncio na Shopee
                </a>
              )}
              <Link className="btn" href="/novo-anuncio/shopee">
                Publicar outra peça
              </Link>
              <Link className="btn" href="/novo-anuncio/shopee?nova=1">
                Cadastrar peça nova
              </Link>
              <Link className="btn" href="/estoque">
                Ver estoque
              </Link>
            </div>
          </div>
        </>
      );
    }
  }

  if (nova === "1") {
    const formas = await formasDeEnvio(lojas[0].id);
    return (
      <>
        {cabeca}
        {formas.erro && <div className="trialbar bad">{formas.erro}</div>}
        <FormularioShopee loja={{ id: lojas[0].id, nome: lojas[0].apelido ?? lojas[0].usuarioExterno }} fretes={formas.fretes} peca={null} />
      </>
    );
  }

  // sem peça escolhida: lista as disponíveis que ainda não estão na Shopee
  const peca = pecaId && /^[0-9a-f-]{36}$/.test(pecaId)
    ? (await db.select().from(pecas).where(and(eq(pecas.id, pecaId), eq(pecas.contaId, conta.id))))[0]
    : undefined;
  if (!peca) {
    const livres = await db
      .select({ id: pecas.id, sku: pecas.sku, titulo: pecas.titulo, preco: pecas.precoCentavos })
      .from(pecas)
      .leftJoin(anuncios, and(eq(anuncios.pecaId, pecas.id), eq(anuncios.canal, "shopee")))
      .where(and(eq(pecas.contaId, conta.id), eq(pecas.situacao, "disponivel"), isNull(anuncios.id)))
      .orderBy(desc(pecas.criadoEm))
      .limit(60);
    return (
      <>
        {cabeca}
        {livres.length === 0 ? (
          <div className="emptybox">
            Todas as peças disponíveis já estão na Shopee. Cadastre uma <Link href="/novo-anuncio/shopee?nova=1">peça nova</Link>.
          </div>
        ) : (
          <div className="panel">
            <h2>Peças que ainda não estão na Shopee</h2>
            {livres.map((p) => (
              <div className="plat" key={p.id}>
                <div className="nm">
                  <b>{p.titulo}</b>
                  <small>
                    <span className="tag">{p.sku}</span> {reais(p.preco)}
                  </small>
                </div>
                <Link className="btn small primary" href={`/novo-anuncio/shopee?peca=${p.id}`}>
                  Publicar
                </Link>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  const [ja] = await db.select({ url: anuncios.url }).from(anuncios).where(and(eq(anuncios.pecaId, peca.id), eq(anuncios.canal, "shopee")));
  if (ja) {
    return (
      <>
        {cabeca}
        <div className="emptybox">
          Esta peça já está na Shopee. {ja.url && <a href={ja.url} target="_blank" rel="noreferrer">Ver anúncio</a>}
        </div>
      </>
    );
  }

  const fotos = (await db.select({ url: fotosPeca.url }).from(fotosPeca).where(eq(fotosPeca.pecaId, peca.id)).orderBy(asc(fotosPeca.ordem))).map((f) => f.url);
  const { fretes, erro: erroFretes } = await formasDeEnvio(lojas[0].id);

  return (
    <>
      {cabeca}
      {erroFretes && <div className="trialbar bad">{erroFretes}</div>}
      <FormularioShopee
        loja={{ id: lojas[0].id, nome: lojas[0].apelido ?? lojas[0].usuarioExterno }}
        fretes={fretes}
        peca={{
          id: peca.id,
          sku: peca.sku,
          titulo: peca.titulo,
          descricao: peca.descricao ?? "",
          marca: peca.marca ?? "",
          preco: (peca.precoCentavos / 100).toFixed(2).replace(".", ","),
          quantidade: peca.quantidade,
          peso: peca.pesoGramas ?? null,
          comprimento: peca.comprimentoCm ?? null,
          largura: peca.larguraCm ?? null,
          altura: peca.alturaCm ?? null,
          fotos,
        }}
      />
    </>
  );
}
