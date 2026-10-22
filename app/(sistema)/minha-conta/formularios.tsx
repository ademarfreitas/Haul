"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { salvarGeral, trocarSenha, type Resposta } from "./acoes";

function Salvar({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? "Salvando…" : children}
    </button>
  );
}

const Msg = ({ r }: { r: Resposta }) => (
  <span className="muted" style={{ fontSize: ".84rem", color: r.erro ? "var(--bad)" : r.ok ? "var(--good)" : undefined }} aria-live="polite">
    {r.erro ?? r.ok ?? ""}
  </span>
);

type Geral = { nome: string; email: string; celular: string; tipo: string; documento: string };

export function FormGeral({ g }: { g: Geral }) {
  const [r, acao] = useActionState(salvarGeral, {} as Resposta);
  return (
    <form className="panel" action={acao}>
      <div className="form">
        <div className="f s6">
          <label htmlFor="a-nome">Nome completo</label>
          <input id="a-nome" name="nome" defaultValue={g.nome} autoComplete="name" />
        </div>
        <div className="f s3">
          <label htmlFor="a-email">E-mail</label>
          <input id="a-email" value={g.email} disabled />
          <span className="hint">Para trocar o e-mail, fale com o suporte.</span>
        </div>
        <div className="f s3">
          <label htmlFor="a-cel">Celular</label>
          <input id="a-cel" name="celular" type="tel" defaultValue={g.celular} placeholder="(11) 91234-5678" />
        </div>
        <div className="f s6">
          <span className="lab">Tipo de conta</span>
          <span style={{ paddingTop: 6 }}>
            {g.tipo}
            {g.documento && ` · ${g.documento}`}
          </span>
        </div>
      </div>
      <div className="rowend">
        <Msg r={r} />
        <Salvar>Salvar alterações</Salvar>
      </div>
    </form>
  );
}

export function FormSenha({ minimo }: { minimo: number }) {
  const [r, acao] = useActionState(trocarSenha, {} as Resposta);
  const [nota, setNota] = useState(0);
  return (
    <form className="panel" action={acao}>
      <h2>Alterar senha</h2>
      <div className="form" style={{ marginTop: 10 }}>
        <div className="f s6">
          <label htmlFor="pw0">Senha atual</label>
          <input id="pw0" name="atual" type="password" autoComplete="current-password" />
        </div>
        <div className="f s3">
          <label htmlFor="pw1">Nova senha</label>
          <input
            id="pw1"
            name="nova"
            type="password"
            autoComplete="new-password"
            onChange={(e) => {
              const v = e.target.value;
              setNota(Number(v.length >= minimo) + Number(/[A-Z]/.test(v) && /[a-z]/.test(v)) + Number(/\d/.test(v)) + Number(/[^A-Za-z0-9]/.test(v)));
            }}
          />
          <div className="strength">
            <i style={{ width: `${nota * 25}%`, background: ["var(--bad)", "var(--bad)", "var(--warn)", "var(--good)", "var(--good)"][nota] }} />
          </div>
          <span className="hint">Pelo menos {minimo} caracteres.</span>
        </div>
        <div className="f s3">
          <label htmlFor="pw2">Repita a nova senha</label>
          <input id="pw2" name="repetida" type="password" autoComplete="new-password" />
        </div>
      </div>
      <div className="rowend">
        <Msg r={r} />
        <Salvar>Alterar senha</Salvar>
      </div>
    </form>
  );
}

export function Copiar({ texto }: { texto: string }) {
  const [feito, setFeito] = useState(false);
  return (
    <div className="copyrow">
      <input value={texto} readOnly aria-label="Seu link de indicação" onFocus={(e) => e.target.select()} />
      <button
        className="btn primary"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(texto);
            setFeito(true);
          } catch {
            setFeito(false);
          }
        }}
      >
        {feito ? "Copiado" : "Copiar link"}
      </button>
    </div>
  );
}
