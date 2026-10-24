import Link from "next/link";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { anuncios, conexoesCanal, fotosPeca, pecas } from "@/db/schema";
import { reais } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";
import { FormularioShein } from "./formulario";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Publicar na Shein · Plist" };

// Publica na Shein uma peça que já está no estoque (cadastrada aqui ou vinda de outro canal).
export default async function PublicarShein({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { conta } = await exigirConta("/novo-anuncio/shein");
  const { peca: pecaId } = await searchParams;
  const db = obterDb();

  const lojas = await db
    .select({ id: conexoesCanal.id, apelido: conexoesCanal.apelido })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.contaId, conta.id), eq(conexoesCanal.canal, "shein"), eq(conexoesCanal.situacao, "ativa")));

  const cabeca = (
    <header className="vhead">
      <div>
        <p className="eyebrow">Mesma peça, mais um canal</p>
        <h1>Publicar na Shein</h1>
        <p className="sub">Escolha uma peça do estoque: o Plist usa as fotos e os dados dela. A Shein analisa o produto antes de pôr na vitrine.</p>
      </div>
    </header>
  );

  if (!lojas.length) {
    return (
      <>
        {cabeca}
        <div className="emptybox">
          <p>Para publicar, conecte sua loja da Shein.</p>
          <p style={{ marginTop: 12 }}>
            <Link className="btn primary" href="/canais">Conectar Shein</Link>
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
      .leftJoin(anuncios, and(eq(anuncios.pecaId, pecas.id), eq(anuncios.canal, "shein")))
      .where(and(eq(pecas.contaId, conta.id), eq(pecas.situacao, "disponivel"), isNull(anuncios.id)))
      .orderBy(desc(pecas.criadoEm))
      .limit(60);
    return (
      <>
        {cabeca}
        {livres.length === 0 ? (
          <div className="emptybox">
            Nenhuma peça disponível fora da Shein. Cadastre uma em <Link href="/novo-anuncio">Novo anúncio</Link> ou traga os anúncios dos outros canais em <Link href="/inventario">Inventário</Link>.
          </div>
        ) : (
          <div className="panel">
            <h2>Peças que ainda não estão na Shein</h2>
            {livres.map((p) => (
              <div className="plat" key={p.id}>
                <div className="nm">
                  <b>{p.titulo}</b>
                  <small>
                    <span className="tag">{p.sku}</span> {reais(p.preco)}
                  </small>
                </div>
                <Link className="btn small primary" href={`/novo-anuncio/shein?peca=${p.id}`}>
                  Publicar
                </Link>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  const [ja] = await db.select({ situacao: anuncios.situacao }).from(anuncios).where(and(eq(anuncios.pecaId, peca.id), eq(anuncios.canal, "shein")));
  // também é o que aparece logo depois de publicar: a ação atualiza esta página, que já acha o anúncio
  if (ja) {
    return (
      <>
        {cabeca}
        <div className="panel" style={{ maxWidth: 640 }}>
          <h2>{ja.situacao === "publicando" ? "Enviado para a Shein" : "Esta peça já está na Shein"}</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            <span className="tag">{peca.sku}</span> {peca.titulo}
          </p>
          {ja.situacao === "publicando" && (
            <p className="muted" style={{ marginTop: 6 }}>
              A Shein analisa o produto antes de pôr na vitrine. Quando aprovar, o anúncio aparece como ativo depois de <b>Sincronizar anúncios</b> no Inventário.
            </p>
          )}
          <div className="actions" style={{ marginTop: 14 }}>
            <Link className="btn primary" href="/novo-anuncio/shein">
              Publicar outra peça
            </Link>
            <Link className="btn" href="/estoque">
              Ver estoque
            </Link>
          </div>
        </div>
      </>
    );
  }

  const fotos = (await db.select({ url: fotosPeca.url }).from(fotosPeca).where(eq(fotosPeca.pecaId, peca.id)).orderBy(asc(fotosPeca.ordem))).map((f) => f.url);
  return (
    <>
      {cabeca}
      <FormularioShein
        loja={{ id: lojas[0].id, nome: lojas[0].apelido ?? "Shein" }}
        peca={{
          id: peca.id,
          sku: peca.sku,
          titulo: peca.titulo,
          descricao: peca.descricao ?? "",
          marca: peca.marca ?? "",
          cor: peca.cor ?? "",
          tamanho: peca.tamanho ?? "",
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
