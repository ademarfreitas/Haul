import Link from "next/link";
import { exigirConta } from "@/lib/conta";
import { emailConfigurado } from "@/lib/email";
import { salvarAvisos } from "./acoes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Avisos · Plist" };

export default async function Pagina({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { conta, usuario } = await exigirConta("/avisos");
  const salvo = (await searchParams).salvo === "1";
  const email = conta.avisosEmail ?? {};
  const ligado = (k: "custo" | "estoque") => email[k] !== false;

  return (
    <>
      <header className="vhead">
        <div>
          <h1>Avisos</h1>
          <p className="sub">Escolha o que chega no seu e-mail. Todo aviso também fica em <Link href="/tarefas">Tarefas</Link>.</p>
        </div>
      </header>

      <form className="panel" style={{ maxWidth: 640 }} action={salvarAvisos}>
        <h2>Por e-mail</h2>
        <p className="muted" style={{ fontSize: ".84rem", marginTop: 4 }}>
          Vai para {usuario.email}
          {!emailConfigurado() ? " (o envio de e-mail ainda não foi ligado no Plist; por enquanto os avisos ficam só em Tarefas)" : ""}.
        </p>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14 }}>
          <input type="checkbox" name="custo" value="1" defaultChecked={ligado("custo")} />
          <span>
            <b>O fornecedor cobrou mais</b>
            <span className="hint" style={{ display: "block" }}>Quando uma nota ou planilha nova traz custo maior: mostra quanto sobra em cada canal e o preço que mantém o que sobrava.</span>
          </span>
        </label>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12 }}>
          <input type="checkbox" name="estoque" value="1" defaultChecked={ligado("estoque")} />
          <span>
            <b>Estoque baixo</b>
            <span className="hint" style={{ display: "block" }}>Quando um produto chega na quantidade mínima escolhida ao importar do fornecedor.</span>
          </span>
        </label>
        <div className="actions" style={{ marginTop: 16 }}>
          <button className="btn primary" type="submit">Salvar</button>
          {salvo && <span className="muted">Salvo.</span>}
        </div>
      </form>

      <div className="panel" style={{ maxWidth: 640 }}>
        <h2>Por SMS</h2>
        <p style={{ marginTop: 6 }}>
          <span className="pill p-accent">Em construção</span>
        </p>
        <p className="muted" style={{ fontSize: ".84rem", marginTop: 8 }}>
          Aviso de venda com o que sobra depois das taxas, alerta quando um anúncio não sai de outro canal e resumo do dia. Até lá, acompanhe as vendas em Tarefas e Pedidos.
        </p>
      </div>
    </>
  );
}
