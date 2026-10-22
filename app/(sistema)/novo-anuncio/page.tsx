import { exigirConta } from "@/lib/conta";
import { EmBreve } from "../_partes/em-breve";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novo anúncio · Plist" };

export default async function Pagina() {
  await exigirConta("/novo-anuncio");
  return (
    <EmBreve
      titulo="Novo anúncio"
      sub="Coloque as fotos, preencha o anúncio e publique em todos os canais que passarem nas regras."
      oQueVem={["Fotos, título, ficha técnica e preço num formulário só", "Publicação no Mercado Livre direto do Plist", "Os outros canais conforme forem conectados"]}
    />
  );
}
