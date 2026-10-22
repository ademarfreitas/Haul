import { exigirConta } from "@/lib/conta";
import { EmBreve } from "../_partes/em-breve";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tarefas · Plist" };

export default async function Pagina() {
  await exigirConta("/tarefas");
  return (
    <EmBreve
      titulo="Tarefas"
      sub="O que falta da sua parte em cada venda, do pedido até o dinheiro liberado."
      oQueVem={["Imprimir etiqueta, despachar e emitir nota de cada venda", "Conferir taxas que vieram diferentes da estimativa", "Reconectar canais que perderam a autorização"]}
    />
  );
}
