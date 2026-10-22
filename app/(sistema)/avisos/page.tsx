import { exigirConta } from "@/lib/conta";
import { EmBreve } from "../_partes/em-breve";

export const dynamic = "force-dynamic";
export const metadata = { title: "Avisos · Plist" };

export default async function Pagina() {
  await exigirConta("/avisos");
  return (
    <EmBreve
      titulo="Avisos"
      sub="Escolha o que chega no seu WhatsApp e no e-mail. Esta tela depende do número de WhatsApp Business do Plist, que ainda está para ser aprovado; até lá, acompanhe as vendas em Tarefas e Pedidos."
      oQueVem={["Aviso de venda com o que sobra depois das taxas", "Alerta quando um anúncio não sai de outro canal", "Resumo do dia"]}
    />
  );
}
