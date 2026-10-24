import Link from "next/link";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, fotosPeca, pecas } from "@/db/schema";
import { reais } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";
import { FormularioAmazon } from "./formulario";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Publicar na Amazon · Plist" };

// Publica na Amazon uma peça do estoque, como oferta num produto do catálogo (ASIN) ou como produto novo,
// ou uma peça nova (?nova=1), que na Amazon só pode ser oferta num produto que já existe (as fotos são do catálogo).
export default async function PublicarAmazon({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { conta } = await exigirConta("/novo-anuncio/amazon");
  const { peca: pecaId, nova } = await searchParams;
  const db = obterDb();

  const contas = await db
    .select({ id: conexoesCanal.id, apelido: conexoesCanal.apelido, usuarioExterno: conexoesCanal.usuarioExterno })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.contaId, conta.id), eq(conexoesCanal.canal, "amazon"), eq(conexoesCanal.situacao, "ativa")));

  const cabeca = (
    <header className="vhead">
      <div>
        <p className="eyebrow">Mesma peça, mais um canal</p>
        <h1>Publicar na Amazon</h1>
        <p className="sub">Ache o produto no catálogo da Amazon e venda nele, ou crie um produto novo com as fotos da peça.</p>
      </div>
      <div className="actions">
        <Link className="btn" href="/novo-anuncio/amazon?nova=1">Peça nova</Link>
      </div>
    </header>
  );

  if (!contas.length) {
    return (
      <>
        {cabeca}
        <div className="emptybox">
          <p>Para publicar, conecte sua conta da Amazon.</p>
          <p style={{ marginTop: 12 }}>
            <a className="btn primary" href="/api/canais/amazon/conectar?voltar=/inventario">Conectar Amazon</a>
          </p>
        </div>
      </>
    );
  }
  const loja = { id: contas[0].id, nome: contas[0].apelido ?? contas[0].usuarioExterno };

  if (nova === "1") {
    return (
      <>
        {cabeca}
        <FormularioAmazon loja={loja} peca={null} />
      </>
    );
  }

  const peca = pecaId && /^[0-9a-f-]{36}$/.test(pecaId)
    ? (await db.select().from(pecas).where(and(eq(pecas.id, pecaId), eq(pecas.contaId, conta.id))))[0]
    : undefined;
  if (!peca) {
    const livres = await db
      .select({ id: pecas.id, sku: pecas.sku, titulo: pecas.titulo, preco: pecas.precoCentavos })
      .from(pecas)
      .leftJoin(anuncios, and(eq(anuncios.pecaId, pecas.id), eq(anuncios.canal, "amazon")))
      .where(and(eq(pecas.contaId, conta.id), eq(pecas.situacao, "disponivel"), isNull(anuncios.id)))
      .orderBy(desc(pecas.criadoEm))
      .limit(60);
    return (
      <>
        {cabeca}
        {livres.length === 0 ? (
          <div className="emptybox">
            Todas as peças disponíveis já estão na Amazon. Cadastre uma <Link href="/novo-anuncio/amazon?nova=1">peça nova</Link>.
          </div>
        ) : (
          <div className="panel">
            <h2>Peças que ainda não estão na Amazon</h2>
            {livres.map((p) => (
              <div className="plat" key={p.id}>
                <div className="nm">
                  <b>{p.titulo}</b>
                  <small>
                    <span className="tag">{p.sku}</span> {reais(p.preco)}
                  </small>
                </div>
                <Link className="btn small primary" href={`/novo-anuncio/amazon?peca=${p.id}`}>
                  Publicar
                </Link>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  const [ja] = await db.select({ url: anuncios.url }).from(anuncios).where(and(eq(anuncios.pecaId, peca.id), eq(anuncios.canal, "amazon")));
  if (ja) {
    return (
      <>
        {cabeca}
        <div className="emptybox">
          Esta peça já está na Amazon. {ja.url && <a href={ja.url} target="_blank" rel="noreferrer">Ver anúncio</a>}
        </div>
      </>
    );
  }

  const fotos = (await db.select({ url: fotosPeca.url }).from(fotosPeca).where(eq(fotosPeca.pecaId, peca.id)).orderBy(asc(fotosPeca.ordem))).map((f) => f.url);
  return (
    <>
      {cabeca}
      <FormularioAmazon
        loja={loja}
        peca={{
          id: peca.id,
          sku: peca.sku,
          titulo: peca.titulo,
          descricao: peca.descricao ?? "",
          marca: peca.marca ?? "",
          condicao: peca.condicao ?? "",
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
