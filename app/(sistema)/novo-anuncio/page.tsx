import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { exigirConta } from "@/lib/conta";
import { Formulario } from "./formulario";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Novo anúncio · Plist" };

export default async function NovoAnuncio() {
  const { conta } = await exigirConta("/novo-anuncio");
  const conexoes = await obterDb()
    .select({ id: conexoesCanal.id, apelido: conexoesCanal.apelido, usuarioExterno: conexoesCanal.usuarioExterno })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.contaId, conta.id), eq(conexoesCanal.canal, "mercado_livre"), eq(conexoesCanal.situacao, "ativa")));
  const [shopee] = await obterDb()
    .select({ id: conexoesCanal.id })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.contaId, conta.id), eq(conexoesCanal.canal, "shopee"), eq(conexoesCanal.situacao, "ativa")))
    .limit(1);

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">Cadastre uma vez</p>
          <h1>Novo anúncio</h1>
          <p className="sub">Coloque as fotos, preencha o anúncio e publique nos canais conectados. Aqui a peça vai para o Mercado Livre; depois, a mesma peça vai para a Shopee em <Link href="/novo-anuncio/shopee">Publicar na Shopee</Link> e para a Magalu em <Link href="/novo-anuncio/magalu">Publicar na Magalu</Link>.</p>
        </div>
      </header>
      {conexoes.length === 0 ? (
        <div className="emptybox">
          <p>
            {shopee
              ? "Sua loja da Shopee está conectada: cadastre a peça direto nela. Para publicar também no Mercado Livre, conecte a conta."
              : "Para publicar, conecte sua conta do Mercado Livre ou sua loja da Shopee. As fotos ficam guardadas no canal."}
          </p>
          <p style={{ marginTop: 12 }}>
            {shopee ? (
              <Link className="btn primary" href="/novo-anuncio/shopee?nova=1">Cadastrar na Shopee</Link>
            ) : (
              <a className="btn primary" href="/api/canais/shopee/conectar?voltar=/inventario">Conectar Shopee</a>
            )}{" "}
            <a className="btn" href="/api/canais/mercado-livre/conectar?voltar=/inventario">Conectar Mercado Livre</a>{" "}
            <Link className="btn" href="/canais">Ver Canais</Link>
          </p>
        </div>
      ) : (
        <Formulario conexoes={conexoes.map((c) => ({ id: c.id, nome: c.apelido ?? c.usuarioExterno }))} />
      )}
    </>
  );
}
