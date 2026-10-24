import Link from "next/link";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { clienteEtiquetas, pecas } from "@/db/schema";
import { exigirConta } from "@/lib/conta";
import { temCrm } from "@/lib/crm";
import { Vitrine } from "../../vitrine";
import { FormCampanha } from "../formulario";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova campanha · CRM · Plist" };

export default async function NovaCampanha() {
  const { conta } = await exigirConta("/crm/campanhas/nova");
  if (!temCrm(conta)) return <Vitrine />;
  const db = obterDb();
  const [etiquetas, categorias] = await Promise.all([
    db.selectDistinct({ e: clienteEtiquetas.etiqueta }).from(clienteEtiquetas).where(eq(clienteEtiquetas.contaId, conta.id)).orderBy(asc(clienteEtiquetas.etiqueta)),
    db
      .selectDistinct({ c: pecas.categoria })
      .from(pecas)
      .where(and(eq(pecas.contaId, conta.id), isNotNull(pecas.categoria)))
      .orderBy(asc(pecas.categoria))
      .limit(300),
  ]);
  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">
            <Link href="/crm/campanhas">Campanhas</Link>
          </p>
          <h1>Nova campanha</h1>
          <p className="sub">Escolha o grupo e escreva a mensagem. Depois você manda um a um pelo seu WhatsApp, e o Plist mede quem comprou em seguida.</p>
        </div>
      </header>
      <FormCampanha etiquetas={etiquetas.map((x) => x.e)} categorias={categorias.map((x) => x.c!).filter(Boolean)} />
    </>
  );
}
