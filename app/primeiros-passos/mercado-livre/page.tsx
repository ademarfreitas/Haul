import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { contaAtual } from "@/lib/conta";
import { Moldura } from "../../_acesso/moldura";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conectar o Mercado Livre · Plist" };

// Segundo passo do onboarding, logo depois dos dados da loja. Dá para pular; depois fica em Canais.
export default async function ConectarMercadoLivre() {
  const atual = await contaAtual();
  if (!atual) redirect("/entrar");
  if (!atual.conta.primeirosPassosEm) redirect("/primeiros-passos");
  const [conectada] = await obterDb()
    .select({ id: conexoesCanal.id })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.contaId, atual.conta.id), eq(conexoesCanal.canal, "mercado_livre")))
    .limit(1);
  if (conectada) redirect("/inventario");

  return (
    <Moldura
      titulo="Conecte o Mercado Livre"
      sub="Passo 2 de 2. O Plist traz seus anúncios e pedidos e passa a publicar por você. Você entra no Mercado Livre e autoriza; a gente guarda só a autorização, cifrada."
    >
      <div className="formulario">
        <a className="botao largo centro" href="/api/canais/mercado-livre/conectar?voltar=/inventario">Conectar Mercado Livre</a>
        <a className="botao secundario centro" href="/inventario">Pular por agora</a>
      </div>
      <p className="rodape-form suave">Os outros canais você conecta depois, em Canais.</p>
    </Moldura>
  );
}
