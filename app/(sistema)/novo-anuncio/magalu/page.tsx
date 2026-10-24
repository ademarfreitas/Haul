import Link from "next/link";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, fotosPeca, pecas } from "@/db/schema";
import { reais } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";
import { FormularioMagalu } from "./formulario";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Publicar na Magalu · Plist" };

// Publica na Magalu uma peça que já está no estoque (cadastrada aqui ou vinda do ML ou da Shopee).
export default async function PublicarMagalu({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { conta } = await exigirConta("/novo-anuncio/magalu");
  const { peca: pecaId } = await searchParams;
  const db = obterDb();

  const lojas = await db
    .select({ id: conexoesCanal.id, apelido: conexoesCanal.apelido, usuarioExterno: conexoesCanal.usuarioExterno })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.contaId, conta.id), eq(conexoesCanal.canal, "magalu"), eq(conexoesCanal.situacao, "ativa")));

  const cabeca = (
    <header className="vhead">
      <div>
        <p className="eyebrow">Mesma peça, mais um canal</p>
        <h1>Publicar na Magalu</h1>
        <p className="sub">Escolha uma peça do estoque: o Plist usa as fotos e os dados dela. A Magalu confere o anúncio antes de pôr no ar.</p>
      </div>
    </header>
  );

  if (!lojas.length) {
    return (
      <>
        {cabeca}
        <div className="emptybox">
          <p>Para publicar, conecte sua loja da Magalu (a Magalu só aceita lojas com CNPJ).</p>
          <p style={{ marginTop: 12 }}>
            <a className="btn primary" href="/api/canais/magalu/conectar?voltar=/inventario">Conectar Magalu</a>
          </p>
        </div>
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
      .leftJoin(anuncios, and(eq(anuncios.pecaId, pecas.id), eq(anuncios.canal, "magalu")))
      .where(and(eq(pecas.contaId, conta.id), eq(pecas.situacao, "disponivel"), isNull(anuncios.id)))
      .orderBy(desc(pecas.criadoEm))
      .limit(60);
    return (
      <>
        {cabeca}
        {livres.length === 0 ? (
          <div className="emptybox">
            Todas as peças disponíveis já estão na Magalu. Cadastre uma peça em <Link href="/novo-anuncio">Novo anúncio</Link>.
          </div>
        ) : (
          <div className="panel">
            <h2>Peças que ainda não estão na Magalu</h2>
            {livres.map((p) => (
              <div className="plat" key={p.id}>
                <div className="nm">
                  <b>{p.titulo}</b>
                  <small>
                    <span className="tag">{p.sku}</span> {reais(p.preco)}
                  </small>
                </div>
                <Link className="btn small primary" href={`/novo-anuncio/magalu?peca=${p.id}`}>
                  Publicar
                </Link>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  const [ja] = await db.select({ url: anuncios.url }).from(anuncios).where(and(eq(anuncios.pecaId, peca.id), eq(anuncios.canal, "magalu")));
  if (ja) {
    return (
      <>
        {cabeca}
        <div className="emptybox">
          Esta peça já está na Magalu. {ja.url && <a href={ja.url} target="_blank" rel="noreferrer">Ver anúncio</a>}
        </div>
      </>
    );
  }

  const fotos = (await db.select({ url: fotosPeca.url }).from(fotosPeca).where(eq(fotosPeca.pecaId, peca.id)).orderBy(asc(fotosPeca.ordem))).map((f) => f.url);

  return (
    <>
      {cabeca}
      <FormularioMagalu
        loja={{ id: lojas[0].id, nome: lojas[0].apelido ?? lojas[0].usuarioExterno }}
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
          fotos: fotos.filter((u) => u.startsWith("https://")),
        }}
      />
    </>
  );
}
