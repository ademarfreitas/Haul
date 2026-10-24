"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ORIGENS } from "@/lib/crm-medidas";
import { adicionarEtiqueta, registrarVendaDireta, salvarCliente, type Resposta } from "./acoes";

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

type Dados = {
  id?: string;
  nome?: string;
  whatsapp?: string | null;
  email?: string | null;
  aniversario?: string | null;
  origem?: string | null;
  ofertas?: boolean;
  ofertasOrigem?: string | null;
};

// Cliente próprio: dados de contato e aceite de ofertas (LGPD).
export function FormCliente({ c = {} }: { c?: Dados }) {
  const [r, acao] = useActionState(salvarCliente, {} as Resposta);
  const zap = c.whatsapp ? c.whatsapp.replace(/^55/, "") : "";
  return (
    <form className="panel" action={acao}>
      {c.id && <input type="hidden" name="id" value={c.id} />}
      <div className="form">
        <div className="f s3">
          <label htmlFor="c-nome">Nome</label>
          <input id="c-nome" name="nome" defaultValue={c.nome} required maxLength={120} />
        </div>
        <div className="f s3">
          <label htmlFor="c-zap">WhatsApp</label>
          <input id="c-zap" name="whatsapp" type="tel" defaultValue={zap} placeholder="(11) 91234-5678" />
        </div>
        <div className="f s3">
          <label htmlFor="c-email">E-mail</label>
          <input id="c-email" name="email" type="email" defaultValue={c.email ?? ""} />
        </div>
        <div className="f s3">
          <label htmlFor="c-aniv">Aniversário</label>
          <input id="c-aniv" name="aniversario" type="date" defaultValue={c.aniversario ?? ""} />
        </div>
        <div className="f s3">
          <label htmlFor="c-origem">Como conheceu a loja</label>
          <select id="c-origem" name="origem" defaultValue={c.origem ?? ""}>
            <option value="">—</option>
            {Object.entries(ORIGENS)
              .filter(([k]) => k !== "marketplace")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        </div>
        <div className="f s3">
          <label htmlFor="c-aceite">Como aceitou receber ofertas</label>
          <input id="c-aceite" name="ofertasOrigem" defaultValue={c.ofertasOrigem ?? ""} placeholder="Ex.: pediu no bazar, respondeu no Instagram" maxLength={80} />
        </div>
        <label className="f s6" style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center", fontSize: ".9rem" }}>
          <input type="checkbox" name="ofertas" defaultChecked={c.ofertas} style={{ width: "auto" }} />
          O cliente aceitou receber ofertas por WhatsApp ou e-mail (LGPD: guarde como ele aceitou; desmarcar apaga o aceite).
        </label>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
        <Salvar>{c.id ? "Salvar" : "Cadastrar cliente"}</Salvar>
        <Msg r={r} />
      </div>
    </form>
  );
}

export function FormEtiqueta({ id }: { id: string }) {
  const [r, acao] = useActionState(adicionarEtiqueta, {} as Resposta);
  return (
    <form action={acao} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
      <input type="hidden" name="id" value={id} />
      <input name="etiqueta" placeholder="Ex.: vintage, plus size, jeans" maxLength={30} style={{ maxWidth: 220 }} aria-label="Nova etiqueta" />
      <button className="btn small" type="submit">
        Adicionar
      </button>
      <Msg r={r} />
    </form>
  );
}

export function FormVenda({ id, pecas, hoje }: { id: string; pecas: { id: string; titulo: string; preco: string }[]; hoje: string }) {
  const [r, acao] = useActionState(registrarVendaDireta, {} as Resposta);
  return (
    <form action={acao} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
      <input type="hidden" name="id" value={id} />
      <select name="peca" defaultValue="" aria-label="Peça" style={{ maxWidth: 280 }}>
        <option value="">Sem peça do estoque</option>
        {pecas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.titulo} · {p.preco}
          </option>
        ))}
      </select>
      <input name="valor" inputMode="decimal" placeholder="Valor (R$)" aria-label="Valor" style={{ maxWidth: 130 }} required />
      <input name="dia" type="date" defaultValue={hoje} max={hoje} aria-label="Data" style={{ maxWidth: 170 }} />
      <button className="btn small primary" type="submit">
        Registrar venda
      </button>
      <Msg r={r} />
    </form>
  );
}
