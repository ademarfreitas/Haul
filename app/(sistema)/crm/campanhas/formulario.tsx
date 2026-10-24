"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ORDEM_SEGMENTOS, SEGMENTOS } from "@/lib/crm-medidas";
import { criarCampanha, marcarEnvio, type Resposta } from "../acoes-funil";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? "Criando…" : "Criar e ver a lista"}
    </button>
  );
}

export function FormCampanha({ etiquetas, categorias }: { etiquetas: string[]; categorias: string[] }) {
  const [r, acao] = useActionState(criarCampanha, {} as Resposta);
  return (
    <form className="panel" action={acao}>
      <div className="form">
        <div className="f s3">
          <label htmlFor="k-nome">Nome</label>
          <input id="k-nome" name="nome" placeholder="Ex.: Chegou inverno" maxLength={80} required />
        </div>
        <div className="f s3">
          <label htmlFor="k-tipo">Tipo</label>
          <select id="k-tipo" name="tipo" defaultValue="oferta">
            <option value="oferta">Oferta (só quem aceitou receber)</option>
            <option value="relacionamento">Relacionamento (pós-venda, aniversário, agradecimento)</option>
          </select>
        </div>
        <div className="f s2">
          <label htmlFor="k-seg">Segmento</label>
          <select id="k-seg" name="segmento" defaultValue="">
            <option value="">Todos</option>
            {ORDEM_SEGMENTOS.map((s) => (
              <option key={s} value={s}>
                {SEGMENTOS[s].rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="f s2">
          <label htmlFor="k-cat">Compraram</label>
          <select id="k-cat" name="categoria" defaultValue="">
            <option value="">Qualquer categoria</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="f s2">
          <label htmlFor="k-et">Etiqueta</label>
          <select id="k-et" name="etiqueta" defaultValue="">
            <option value="">Qualquer</option>
            {etiquetas.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div className="f s2">
          <label htmlFor="k-cid">Cidade</label>
          <input id="k-cid" name="cidade" maxLength={80} />
        </div>
        <label className="f s2" style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center", fontSize: ".9rem" }}>
          <input type="checkbox" name="maiores" value="1" style={{ width: "auto" }} /> Só os 20% que mais compram
        </label>
        <label className="f s2" style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center", fontSize: ".9rem" }}>
          <input type="checkbox" name="aniversario" value="1" style={{ width: "auto" }} /> Aniversário nos próximos 30 dias
        </label>
        <div className="f s6">
          <label htmlFor="k-msg">Mensagem</label>
          <textarea id="k-msg" name="mensagem" rows={4} maxLength={1000} required defaultValue="Oi {nome}! Aqui é da {empresa}. " />
          <span className="hint">{"{nome}"} vira o primeiro nome do cliente e {"{empresa}"} o nome da sua loja.</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
        <Salvar />
        <span className="muted" style={{ fontSize: ".84rem", color: r.erro ? "var(--bad)" : undefined }} aria-live="polite">
          {r.erro ?? ""}
        </span>
      </div>
    </form>
  );
}

// Abre o WhatsApp com a mensagem e marca o cliente como enviado.
export function Enviar({ campanha, cliente, zap, enviado }: { campanha: string; cliente: string; zap: string; enviado: boolean }) {
  return (
    <form action={marcarEnvio} style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input type="hidden" name="campanha" value={campanha} />
      <input type="hidden" name="cliente" value={cliente} />
      {enviado ? (
        <>
          <span className="pill p-good">Enviada</span>
          <button className="btn small" type="submit" name="desfazer" value="1">
            Desfazer
          </button>
        </>
      ) : (
        <button className="btn small" type="submit" onClick={() => window.open(zap, "_blank", "noopener")} style={{ color: "var(--good)", borderColor: "var(--good)" }}>
          Enviar no WhatsApp
        </button>
      )}
    </form>
  );
}
