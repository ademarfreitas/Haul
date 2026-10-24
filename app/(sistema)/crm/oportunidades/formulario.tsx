"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ABERTAS, ETAPAS } from "@/lib/crm-funil";
import { ORIGENS } from "@/lib/crm-medidas";
import { salvarOportunidade, type Resposta } from "../acoes-funil";

function Salvar({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? "Salvando…" : children}
    </button>
  );
}

type Dados = {
  id?: string;
  clienteId?: string | null;
  contatoNome?: string | null;
  contatoWhatsapp?: string | null;
  titulo?: string;
  valor?: string;
  etapa?: string;
  origem?: string | null;
  proximaAcao?: string | null;
  proximaData?: string | null;
};

export function FormOportunidade({ o = {}, clientes }: { o?: Dados; clientes: { id: string; nome: string }[] }) {
  const [r, acao] = useActionState(salvarOportunidade, {} as Resposta);
  const editando = !!o.id;
  const [cliente, setCliente] = useState(o.clienteId ?? "");
  return (
    <form className="panel" action={acao}>
      {o.id && <input type="hidden" name="id" value={o.id} />}
      <div className="form">
        <div className="f s6">
          <label htmlFor="o-titulo">O que a pessoa quer</label>
          <input id="o-titulo" name="titulo" defaultValue={o.titulo} placeholder="Ex.: 3 vestidos de festa para sábado" maxLength={120} required />
        </div>
        {editando && o.clienteId ? (
          <input type="hidden" name="clienteId" value={o.clienteId} />
        ) : (
          <>
            {!editando && (
              <div className="f s2">
                <label htmlFor="o-cliente">Cliente</label>
                <select id="o-cliente" name="clienteId" value={cliente} onChange={(e) => setCliente(e.target.value)}>
                  <option value="">Contato novo (sem cadastro)</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!cliente && (
              <>
                <div className="f s2">
                  <label htmlFor="o-nome">Nome de quem pediu</label>
                  <input id="o-nome" name="contatoNome" defaultValue={o.contatoNome ?? ""} maxLength={80} />
                </div>
                <div className="f s2">
                  <label htmlFor="o-zap">WhatsApp</label>
                  <input id="o-zap" name="contatoWhatsapp" type="tel" defaultValue={o.contatoWhatsapp?.replace(/^55/, "") ?? ""} placeholder="(11) 91234-5678" />
                </div>
              </>
            )}
          </>
        )}
        <div className="f s2">
          <label htmlFor="o-valor">Valor (R$)</label>
          <input id="o-valor" name="valor" inputMode="decimal" defaultValue={o.valor ?? ""} placeholder="0,00" />
        </div>
        <div className="f s2">
          <label htmlFor="o-etapa">Etapa</label>
          <select id="o-etapa" name="etapa" defaultValue={o.etapa ?? "contato"}>
            {ABERTAS.map((e) => (
              <option key={e} value={e}>
                {ETAPAS[e].rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="f s2">
          <label htmlFor="o-origem">De onde veio</label>
          <select id="o-origem" name="origem" defaultValue={o.origem ?? ""}>
            <option value="">—</option>
            {Object.entries(ORIGENS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="f s4">
          <label htmlFor="o-acao">Próxima ação</label>
          <input id="o-acao" name="proximaAcao" defaultValue={o.proximaAcao ?? ""} placeholder="Ex.: mandar fotos das opções" maxLength={200} />
        </div>
        <div className="f s2">
          <label htmlFor="o-data">Quando</label>
          <input id="o-data" name="proximaData" type="date" defaultValue={o.proximaData ?? ""} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
        <Salvar>{editando ? "Salvar" : "Criar oportunidade"}</Salvar>
        <span className="muted" style={{ fontSize: ".84rem", color: r.erro ? "var(--bad)" : r.ok ? "var(--good)" : undefined }} aria-live="polite">
          {r.erro ?? r.ok ?? ""}
        </span>
      </div>
    </form>
  );
}
