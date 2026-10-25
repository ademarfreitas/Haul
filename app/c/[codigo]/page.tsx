// Página de cadastro da loja (CRM, plano Avançado): o comprador deixa o contato e aceita receber
// novidades. É da loja, não do Plist: o nome em destaque é o do lojista.
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { contas } from "@/db/schema";
import { temCrm } from "@/lib/crm";
import { codigoValido, DE, deValido } from "@/lib/crm-captacao";
import { FormCadastroLoja } from "./formulario";

export const dynamic = "force-dynamic";

async function daLoja(codigo: string) {
  if (!codigoValido(codigo)) return null;
  const [conta] = await obterDb()
    .select({ nome: contas.nome, plano: contas.plano, situacaoAssinatura: contas.situacaoAssinatura, testeAte: contas.testeAte, beneficio: contas.captacaoBeneficio })
    .from(contas)
    .where(eq(contas.captacaoCodigo, codigo));
  return conta && temCrm(conta) ? conta : null;
}

export async function generateMetadata({ params }: { params: Promise<{ codigo: string }> }) {
  const loja = await daLoja((await params).codigo);
  return { title: loja ? `Cadastro · ${loja.nome}` : "Cadastro", robots: { index: false } };
}

export default async function CadastroNaLoja({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { codigo } = await params;
  const loja = await daLoja(codigo);
  if (!loja) notFound();
  const de = deValido((await searchParams).de);
  const comCupom = DE[de].cupom && !!loja.beneficio;

  return (
    <main className="loja-cad">
      <div className="loja-caixa">
        <p className="pilula">{loja.nome}</p>
        <h1>{comCupom ? `Cadastre-se e ganhe ${loja.beneficio}` : `Receba as novidades da ${loja.nome}`}</h1>
        <p className="suave">
          {de === "pacote"
            ? "Obrigado pela compra! Deixe seu WhatsApp para saber primeiro quando chegar peça nova no seu estilo."
            : "Deixe seu WhatsApp para saber primeiro das peças novas, das promoções e ganhar um mimo no aniversário."}
        </p>
        <FormCadastroLoja codigo={codigo} de={de} loja={loja.nome} pedePedido={de === "pacote"} />
        <p className="dica" style={{ marginTop: 18, lineHeight: 1.5 }}>
          Seus dados ficam só com a {loja.nome}, para falar com você sobre novidades e ofertas. Ninguém mais recebe. Para sair ou apagar
          seus dados, é só pedir para a loja.
        </p>
      </div>
      <p className="loja-rodape">
        Feito com <a href="https://plist.com.br">Plist</a>
      </p>
    </main>
  );
}
