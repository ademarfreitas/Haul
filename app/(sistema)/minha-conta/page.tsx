import { exigirConta } from "@/lib/conta";
import { EmBreve } from "../_partes/em-breve";

export const dynamic = "force-dynamic";
export const metadata = { title: "Minha conta · Plist" };

export default async function Pagina() {
  await exigirConta("/minha-conta");
  return (
    <EmBreve
      titulo="Minha conta"
      sub="Dados da loja, plano, cobrança e indicações."
      oQueVem={["Dados da loja e de quem entra", "Plano e cobrança depois do teste grátis", "Link de indicação"]}
    />
  );
}
