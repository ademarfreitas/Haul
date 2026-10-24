import { exigirConta } from "@/lib/conta";
import { EmBreve } from "../_partes/em-breve";

export const dynamic = "force-dynamic";
export const metadata = { title: "Avisos · Plist" };

export default async function Pagina() {
  await exigirConta("/avisos");
  return (
    <EmBreve
      titulo="Avisos"
      sub="Escolha o que chega por SMS e no e-mail. Esta tela depende do envio de SMS do Plist, que ainda está sendo ligado; até lá, acompanhe as vendas em Tarefas e Pedidos."
      oQueVem={["Aviso de venda com o que sobra depois das taxas", "Alerta quando um anúncio não sai de outro canal", "Resumo do dia"]}
    />
  );
}
