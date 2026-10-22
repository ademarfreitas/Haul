import { redirect } from "next/navigation";
import { contaAtual, diasDeTeste } from "@/lib/conta";
import { FormPrimeirosPassos } from "../_acesso/formularios";
import { Moldura } from "../_acesso/moldura";

export const dynamic = "force-dynamic";
export const metadata = { title: "Primeiros passos · Plist" };

// Uma vez só, logo depois do cadastro. Não fica no menu.
export default async function PrimeirosPassos() {
  const atual = await contaAtual();
  if (!atual) redirect("/entrar");
  if (atual.conta.primeirosPassosEm) redirect("/canais");
  const primeiroNome = atual.usuario.nome.split(" ")[0];
  const fim = atual.conta.testeAte.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return (
    <Moldura
      titulo={`Boas-vindas, ${primeiroNome}`}
      sub="Passo 1 de 2: três dados da sua loja. Depois, conectar o Mercado Livre."
      selo={`Teste grátis até ${fim} · ${diasDeTeste(atual.conta.testeAte)} dias`}
    >
      <FormPrimeirosPassos />
    </Moldura>
  );
}
