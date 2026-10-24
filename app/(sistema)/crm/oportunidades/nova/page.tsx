import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { clientes } from "@/db/schema";
import { exigirConta } from "@/lib/conta";
import { temCrm } from "@/lib/crm";
import { Vitrine } from "../../vitrine";
import { FormOportunidade } from "../formulario";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova oportunidade · CRM · Plist" };

export default async function NovaOportunidade({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { conta } = await exigirConta("/crm/oportunidades/nova");
  if (!temCrm(conta)) return <Vitrine />;
  const lista = await obterDb().select({ id: clientes.id, nome: clientes.nome }).from(clientes).where(eq(clientes.contaId, conta.id)).orderBy(asc(clientes.nome)).limit(2000);
  const pedido = (await searchParams).cliente;
  const clienteId = lista.some((c) => c.id === pedido) ? pedido : null;
  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">
            <Link href="/crm/funil">Funil de vendas</Link>
          </p>
          <h1>Nova oportunidade</h1>
          <p className="sub">Alguém pediu uma peça, uma encomenda ou um lote? Anote aqui e acompanhe até fechar.</p>
        </div>
      </header>
      <FormOportunidade clientes={lista} o={{ clienteId }} />
    </>
  );
}
