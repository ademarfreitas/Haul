import Link from "next/link";
import { exigirConta } from "@/lib/conta";
import { temCrm } from "@/lib/crm";
import { FormCliente } from "../formularios";
import { Vitrine } from "../vitrine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novo cliente · CRM · Plist" };

export default async function NovoCliente() {
  const { conta } = await exigirConta("/crm/novo");
  if (!temCrm(conta)) return <Vitrine />;
  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">
            <Link href="/crm">CRM</Link>
          </p>
          <h1>Novo cliente</h1>
          <p className="sub">
            Cliente próprio: quem compra na venda direta, no bazar ou pelo Instagram. Os compradores do Mercado Livre e da Shopee entram sozinhos pelos pedidos.
          </p>
        </div>
      </header>
      <FormCliente />
    </>
  );
}
