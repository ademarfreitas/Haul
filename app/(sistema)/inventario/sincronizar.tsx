"use client";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sincronizar, type EstadoSinc } from "./acoes";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-2.6-6.4" />
        <path d="M21 4v5h-5" />
      </svg>
      {pending ? "Trazendo anúncios…" : "Sincronizar anúncios"}
    </button>
  );
}

// Botão do topo do Inventário e o quadro "Última sincronização" que aparece depois.
export function Sincronizar() {
  const [estado, acao] = useActionState(sincronizar, {} as EstadoSinc);
  const r = estado.resultados ?? [];
  const soma = (k: "novos" | "atualizados" | "total" | "deFora") => r.reduce((s, x) => s + x[k], 0);
  return (
    <>
      <form action={acao}>
        <Botao />
      </form>
      {estado.erros?.map((e) => (
        <p key={e} className="trialbar bad" style={{ marginTop: 14, justifyContent: "center" }} role="alert">
          {e}
        </p>
      ))}
      {r.length > 0 && (
        <div className="panel" style={{ marginTop: 18, textAlign: "left" }} aria-live="polite">
          <div className="ph">
            <div>
              <h2>Última sincronização</h2>
              <p className="muted" style={{ fontSize: ".84rem" }}>
                {new Date(estado.em!).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {r.map((x) => x.conta).join(", ")}
              </p>
            </div>
            <Link className="btn small" href="/estoque">
              Ver estoque
            </Link>
          </div>
          <div className="syncsum">
            <div>
              <b>{soma("novos")}</b>
              <span className="muted">novos no estoque</span>
            </div>
            <div>
              <b>{soma("atualizados")}</b>
              <span className="muted">atualizados</span>
            </div>
            <div>
              <b>{soma("total")}</b>
              <span className="muted">ativos e pausados nos canais</span>
            </div>
            <div>
              <b>{soma("deFora")}</b>
              <span className="muted">ficaram de fora</span>
            </div>
          </div>
          {soma("deFora") > 0 && (
            <p className="note">
              Ficam de fora os anúncios que o canal não devolveu (o Mercado Livre só deixa buscar 1000 por situação de cada vez)
              ou que já estão ligados a outra conta do Plist.
            </p>
          )}
        </div>
      )}
    </>
  );
}
