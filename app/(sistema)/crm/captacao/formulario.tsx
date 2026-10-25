"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { salvarCaptacao, type Resposta } from "./acoes";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Salvar cupom"}
    </button>
  );
}

export function FormCupom({ cupom, beneficio }: { cupom: string | null; beneficio: string | null }) {
  const [r, acao] = useActionState(salvarCaptacao, {} as Resposta);
  return (
    <form action={acao}>
      <div className="form">
        <div className="f s3">
          <label htmlFor="cp-cupom">Código do cupom</label>
          <input id="cp-cupom" name="cupom" defaultValue={cupom ?? ""} placeholder="Ex.: BEMVINDA10" maxLength={20} style={{ textTransform: "uppercase" }} />
        </div>
        <div className="f s3">
          <label htmlFor="cp-benef">O que o cupom dá</label>
          <input id="cp-benef" name="beneficio" defaultValue={beneficio ?? ""} placeholder="Ex.: 10% na próxima compra" maxLength={60} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
        <Salvar />
        <span className="muted" style={{ fontSize: ".84rem", color: r.erro ? "var(--bad)" : r.ok ? "var(--good)" : undefined }} aria-live="polite">
          {r.erro ?? r.ok ?? ""}
        </span>
      </div>
    </form>
  );
}

export function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="btn small"
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(texto).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        });
      }}
    >
      {ok ? "Copiado" : "Copiar link"}
    </button>
  );
}
