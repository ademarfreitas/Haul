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

  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">Cadastre uma vez</p>
          <h1>Novo anúncio</h1>
          <p className="sub">Coloque as fotos, preencha o anúncio e publique nos canais conectados. Hoje o Plist publica no Mercado Livre; os outros canais chegam em seguida.</p>
        </div>
      </header>
      {conexoes.length === 0 ? (
        <div className="emptybox">
          <p>Para publicar, conecte sua conta do Mercado Livre. As fotos também ficam guardadas lá.</p>
          <p style={{ marginTop: 12 }}>
            <a className="btn primary" href="/api/canais/mercado-livre/conectar?voltar=/inventario">Conectar Mercado Livre</a>{" "}
            <Link className="btn" href="/canais">Ver Canais</Link>
          </p>
        </div>
      ) : (
        <Formulario conexoes={conexoes.map((c) => ({ id: c.id, nome: c.apelido ?? c.usuarioExterno }))} />
      )}
    </>
  );
}
