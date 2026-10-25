"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cadastrarNaLoja, type EstadoCadastro } from "./acoes";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button className="botao largo" type="submit" disabled={pending}>
      {pending ? "Um momento…" : "Quero me cadastrar"}
    </button>
  );
}

export function FormCadastroLoja({ codigo, de, loja, pedePedido }: { codigo: string; de: string; loja: string; pedePedido: boolean }) {
  const [estado, acao] = useActionState<EstadoCadastro, FormData>(cadastrarNaLoja, {});
  if (estado.feito) {
    return (
      <div className="msg-ok" aria-live="polite">
        <b>Pronto, cadastro feito!</b>
        {estado.feito.cupom ? (
          <>
            <p style={{ margin: "8px 0 4px" }}>Seu cupom{estado.feito.beneficio ? ` (${estado.feito.beneficio})` : ""}:</p>
            <p className="cupom">{estado.feito.cupom}</p>
            <p style={{ margin: 0 }}>Mostre ou mande este código na sua próxima compra com a {loja}.</p>
          </>
        ) : (
          <p style={{ margin: "8px 0 0" }}>A {loja} vai te avisar das novidades pelo WhatsApp.</p>
        )}
      </div>
    );
  }
  const v = estado.valores ?? {};
  return (
    <form action={acao} className="formulario">
      <input type="hidden" name="codigo" value={codigo} />
      <input type="hidden" name="de" value={de} />
      <label className="escondido" aria-hidden="true">
        Site
        <input name="site" tabIndex={-1} autoComplete="off" />
      </label>
      <label>
        Seu nome
        <input name="nome" autoComplete="name" required maxLength={120} defaultValue={v.nome} />
      </label>
      <label>
        WhatsApp
        <input name="whatsapp" type="tel" inputMode="tel" autoComplete="tel-national" required placeholder="(11) 91234-5678" defaultValue={v.whatsapp} />
      </label>
      <label>
        E-mail <span className="dica">(opcional)</span>
        <input name="email" type="email" autoComplete="email" maxLength={254} defaultValue={v.email} />
      </label>
      <label>
        Aniversário <span className="dica">(opcional, para ganhar um mimo)</span>
        <input name="aniversario" type="date" defaultValue={v.aniversario} />
      </label>
      {pedePedido && (
        <label>
          Número do pedido <span className="dica">(opcional, está no app onde você comprou)</span>
          <input name="pedido" inputMode="numeric" maxLength={40} defaultValue={v.pedido} />
        </label>
      )}
      <label className="marcar" style={{ alignItems: "flex-start" }}>
        <input type="checkbox" name="aceite" required defaultChecked={v.aceite === "on"} style={{ marginTop: 3 }} />
        <span>
          Aceito receber novidades e ofertas da {loja} pelo WhatsApp. Posso pedir para sair quando quiser.
        </span>
      </label>
      <p className="msg-erro" aria-live="polite">
        {estado.erro ?? ""}
      </p>
      <Enviar />
    </form>
  );
}
