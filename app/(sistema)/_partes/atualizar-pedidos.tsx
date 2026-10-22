"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { atualizarPedidos, type EstadoPedidos } from "../pedidos/acoes";

function Botao({ primario }: { primario?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={`btn${primario ? " primary" : ""}`} type="submit" disabled={pending}>
      {pending ? "Buscando vendas…" : "Atualizar pedidos"}
    </button>
  );
}

// Botão de Pedidos e Tarefas: traz as vendas do ML e mostra o resumo numa linha.
export function AtualizarPedidos({ primario }: { primario?: boolean }) {
  const [estado, acao] = useActionState(atualizarPedidos, {} as EstadoPedidos);
  const r = estado.resultados ?? [];
  const novos = r.reduce((s, x) => s + x.novos, 0);
  const tarefas = r.reduce((s, x) => s + x.tarefasNovas, 0);
  return (
    <form action={acao} className="actions">
      {estado.em && (
        <span className="muted" style={{ fontSize: ".84rem" }} aria-live="polite">
          {estado.erros?.length ? estado.erros.join(" ") : `${novos} ${novos === 1 ? "venda nova" : "vendas novas"} · ${tarefas} ${tarefas === 1 ? "tarefa nova" : "tarefas novas"}`}
        </span>
      )}
      <Botao primario={primario} />
    </form>
  );
}
