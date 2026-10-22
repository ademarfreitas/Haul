import { redirect } from "next/navigation";
import { contaAtual, destinoSeguro } from "@/lib/conta";
import { FormEntrar } from "../_acesso/formularios";
import { Moldura } from "../_acesso/moldura";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar · Plist" };

export default async function Entrar({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const volta = destinoSeguro((await searchParams).volta);
  if (await contaAtual()) redirect(volta);
  return (
    <Moldura titulo="Entrar" sub="Acesse seu inventário, pedidos e tarefas.">
      <FormEntrar volta={volta} />
      <p className="rodape-form">Ainda não tem conta? <a href="/cadastro">Comece 30 dias grátis</a></p>
    </Moldura>
  );
}
