"use client";
// Formulários de cadastro, login e primeiros passos. A conferência de verdade é no servidor
// (acoes.ts); aqui só o que ajuda a digitar.
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { cadastrar, definirNovaSenha, entrar, pedirNovaSenha, salvarPrimeirosPassos, type Estado } from "./acoes";

function Enviar({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="botao largo" type="submit" disabled={pending}>
      {pending ? "Um momento…" : children}
    </button>
  );
}

const Erro = ({ estado }: { estado: Estado }) => (
  <p className="msg-erro" aria-live="polite">{estado.erro ?? ""}</p>
);

export function FormCadastro({ plano, ind = "" }: { plano: string; ind?: string }) {
  const [estado, acao] = useActionState(cadastrar, {});
  const v = estado.valores ?? {};
  return (
    <form action={acao} className="formulario">
      <input type="hidden" name="plano" value={v.plano ?? plano} />
      <input type="hidden" name="ind" value={v.ind ?? ind} />
      <label>Nome completo<input name="nome" autoComplete="name" required defaultValue={v.nome} /></label>
      <label>E-mail<input name="email" type="email" autoComplete="email" required defaultValue={v.email} /></label>
      <label>
        Crie uma senha
        <input name="senha" type="password" autoComplete="new-password" required minLength={10} />
        <span className="dica">Pelo menos 10 caracteres.</span>
      </label>
      <Erro estado={estado} />
      <Enviar>Criar conta e começar o teste</Enviar>
    </form>
  );
}

export function FormEntrar({ volta }: { volta: string }) {
  const [estado, acao] = useActionState(entrar, {});
  const v = estado.valores ?? {};
  return (
    <form action={acao} className="formulario">
      <input type="hidden" name="volta" value={v.volta ?? volta} />
      <label>E-mail<input name="email" type="email" autoComplete="email" required defaultValue={v.email} /></label>
      <label>Senha<input name="senha" type="password" autoComplete="current-password" required /></label>
      <div className="linha">
        <label className="marcar"><input type="checkbox" name="manter" defaultChecked /> Manter conectado</label>
        <a className="link-pequeno" href="/esqueci-senha">Esqueceu a senha?</a>
      </div>
      <Erro estado={estado} />
      <Enviar>Entrar</Enviar>
    </form>
  );
}

export function FormEsqueciSenha() {
  const [estado, acao] = useActionState(pedirNovaSenha, {});
  if (estado.ok) return <p className="msg-ok" aria-live="polite">{estado.ok}</p>;
  return (
    <form action={acao} className="formulario">
      <label>E-mail da conta<input name="email" type="email" autoComplete="email" required defaultValue={estado.valores?.email} /></label>
      <Erro estado={estado} />
      <Enviar>Enviar link</Enviar>
    </form>
  );
}

export function FormNovaSenha({ token }: { token: string }) {
  const [estado, acao] = useActionState(definirNovaSenha, {});
  return (
    <form action={acao} className="formulario">
      <input type="hidden" name="t" value={estado.valores?.t ?? token} />
      <label>
        Senha nova
        <input name="senha" type="password" autoComplete="new-password" required minLength={10} />
        <span className="dica">Pelo menos 10 caracteres.</span>
      </label>
      <label>Repita a senha nova<input name="repetir" type="password" autoComplete="new-password" required minLength={10} /></label>
      <Erro estado={estado} />
      <Enviar>Salvar e entrar</Enviar>
    </form>
  );
}

export function FormPrimeirosPassos() {
  const [estado, acao] = useActionState(salvarPrimeirosPassos, {});
  const v = estado.valores ?? {};
  const [tipo, setTipo] = useState(v.tipo || "pf");
  const pf = tipo === "pf";
  return (
    <form action={acao} className="formulario">
      <fieldset className="escolha">
        <legend>Você vende como</legend>
        <label><input type="radio" name="tipo" value="pf" checked={pf} onChange={() => setTipo("pf")} /> Pessoa física (CPF)</label>
        <label><input type="radio" name="tipo" value="pj" checked={!pf} onChange={() => setTipo("pj")} /> Pessoa jurídica (CNPJ)</label>
      </fieldset>
      <label>
        {pf ? "CPF" : "CNPJ"}
        <input key={tipo} name="documento" inputMode="numeric" required defaultValue={v.tipo === tipo ? v.documento : ""}
          placeholder={pf ? "000.000.000-00" : "00.000.000/0000-00"} />
        {pf && <span className="dica">Shein e Magalu só aceitam vendedor com CNPJ.</span>}
      </label>
      {!pf && <label>Razão social<input name="razao" autoComplete="organization" required defaultValue={v.razao} /></label>}
      <label>
        Celular com DDD
        <input name="celular" type="tel" autoComplete="tel-national" required defaultValue={v.celular} placeholder="(11) 91234-5678" />
        <span className="dica">Para os avisos de venda e tarefas.</span>
      </label>
      <Erro estado={estado} />
      <Enviar>Salvar e ir para o sistema</Enviar>
    </form>
  );
}
