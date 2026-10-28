import { redirect } from "next/navigation";
import { cadastroAberto } from "@/lib/cadastro";
import { contaAtual } from "@/lib/conta";
import { FormCadastro, FormListaEspera } from "../_acesso/formularios";
import { Moldura } from "../_acesso/moldura";

export const dynamic = "force-dynamic";
export const metadata = { title: "Criar conta · Plist" };

const NOMES: Record<string, string> = { essencial: "Essencial", pro: "Profissional", avancado: "Avançado" };

export default async function Cadastro({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await contaAtual()) redirect("/inventario");
  // antes do lançamento: lista de espera no lugar do cadastro (lib/cadastro.ts)
  if (!cadastroAberto()) {
    return (
      <Moldura
        titulo="O Plist abre em breve"
        sub="Estamos testando com um grupo pequeno de lojistas. Deixe seu contato e avisamos quando abrir para todos."
        selo="Lista de espera"
      >
        <FormListaEspera />
        <p className="rodape-form">Já recebeu seu acesso? <a href="/entrar">Entrar</a></p>
      </Moldura>
    );
  }
  const { plano = "", ciclo = "", ind = "" } = await searchParams;
  const nome = NOMES[plano];
  const anual = !!nome && ciclo === "anual";
  const indicado = /^[0-9a-f-]{36}$/.test(ind);
  return (
    <Moldura
      titulo="Crie sua conta"
      sub="Venda no Mercado Livre, Shopee, Shein, Amazon, Magalu e Facebook com um cadastro só."
      selo={`${nome ? `Plano ${nome}${anual ? " anual" : ""} · ` : ""}30 dias grátis, sem cartão${indicado ? " · indicação: 5% off nos 12 primeiros meses" : ""}`}
    >
      <FormCadastro plano={nome ? plano : ""} ciclo={anual ? "anual" : "mensal"} ind={indicado ? ind : ""} />
      <p className="rodape-form">Já tem conta? <a href="/entrar">Entrar</a></p>
    </Moldura>
  );
}
