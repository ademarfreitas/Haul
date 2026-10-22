import { exigirConta } from "@/lib/conta";
import { EmBreve } from "../_partes/em-breve";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedidos · Plist" };

export default async function Pagina() {
  await exigirConta("/pedidos");
  return (
    <EmBreve
      titulo="Pedidos"
      sub="Vendas de todos os canais, com etiqueta, taxa e repasse."
      oQueVem={["Pedidos do Mercado Livre chegando sozinhos", "Etiqueta oficial do canal pronta para imprimir", "Taxa estimada, real e confirmada lado a lado"]}
    />
  );
}
