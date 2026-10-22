import { redirect } from "next/navigation";
import { contaAtual } from "@/lib/conta";
import { FormCadastro } from "../_acesso/formularios";
import { Moldura } from "../_acesso/moldura";

export const dynamic = "force-dynamic";
export const metadata = { title: "Criar conta · Plist" };

const NOMES: Record<string, string> = { essencial: "Essencial", pro: "Profissional", avancado: "Avançado" };

export default async function Cadastro({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await contaAtual()) redirect("/canais");
  const { plano = "" } = await searchParams;
  const nome = NOMES[plano];
  return (
    <Moldura
      titulo="Crie sua conta"
      sub="Venda no Mercado Livre, Shopee, Shein, Amazon, Magalu e Facebook com um cadastro só."
      selo={nome ? `Plano ${nome} · 30 dias grátis, sem cartão` : "30 dias grátis, sem cartão"}
    >
      <FormCadastro plano={nome ? plano : ""} />
      <p className="rodape-form">Já tem conta? <a href="/entrar">Entrar</a></p>
    </Moldura>
  );
}
