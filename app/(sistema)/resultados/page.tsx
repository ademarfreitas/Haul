import { exigirConta } from "@/lib/conta";
import { EmBreve } from "../_partes/em-breve";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resultados · Plist" };

export default async function Pagina() {
  await exigirConta("/resultados");
  return (
    <EmBreve
      titulo="Resultados"
      sub="Quanto você vendeu, quanto sobrou e o que está parado."
      oQueVem={["Faturamento e lucro por canal", "Peças paradas há muito tempo", "Comparação de preço com anúncios parecidos"]}
    />
  );
}
