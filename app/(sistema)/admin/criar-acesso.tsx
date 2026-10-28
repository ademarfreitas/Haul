"use client";
// Criar acesso (cadastro fechado antes do lançamento): o dono cria a conta e passa a senha ou manda o convite.
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { criarAcesso, type RespostaAcesso } from "./acoes";

type Plano = { id: string; nome: string };

function Criar() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? "Criando…" : "Criar acesso"}
    </button>
  );
}

export function FormCriarAcesso({ planos, emailPronto, aberto }: { planos: Plano[]; emailPronto: boolean; aberto: boolean }) {
  const [r, acao] = useActionState(criarAcesso, {} as RespostaAcesso);
  const v = r.valores ?? {};
  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <h2>Criar acesso</h2>
      <p className="muted" style={{ fontSize: ".84rem", marginTop: 2 }}>
        {aberto
          ? "O cadastro está aberto para todos (CADASTRO_ABERTO). Aqui você ainda pode criar uma conta para alguém."
          : "O cadastro pelo site está fechado: só entra quem você criar aqui. Para abrir no lançamento, CADASTRO_ABERTO=sim na Vercel."}
      </p>
      {/* a chave troca a cada acesso criado, para o formulário voltar limpo */}
      <form key={r.ok ? r.email : "form"} action={acao} className="form" style={{ marginTop: 10 }}>
        <div className="f s2">
          <label htmlFor="ca-nome">Nome completo</label>
          <input id="ca-nome" name="nome" required defaultValue={v.nome} autoComplete="off" />
        </div>
        <div className="f s2">
          <label htmlFor="ca-email">E-mail de login</label>
          <input id="ca-email" name="email" type="email" required defaultValue={v.email} autoComplete="off" />
        </div>
        <div className="f s2">
          <label htmlFor="ca-senha">Senha inicial</label>
          <input id="ca-senha" name="senha" type="text" minLength={10} defaultValue="" autoComplete="new-password" placeholder="Em branco: o Plist gera uma" />
        </div>
        <div className="f s2">
          <label htmlFor="ca-plano">Plano</label>
          <select id="ca-plano" name="plano" defaultValue={v.plano ?? ""}>
            <option value="">Ainda não escolheu</option>
            {planos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="f s2">
          <label htmlFor="ca-dias">Dias de teste grátis</label>
          <input id="ca-dias" name="dias" type="number" min={1} max={365} defaultValue={v.dias ?? "30"} />
        </div>
        <div className="f s2" style={{ alignSelf: "end" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 500 }}>
            <input type="checkbox" name="convite" style={{ width: "auto" }} defaultChecked={r.valores ? v.convite === "on" : emailPronto} disabled={!emailPronto} />
            Mandar convite por e-mail
          </label>
          {!emailPronto && <span className="hint">O envio de e-mail não está configurado.</span>}
        </div>
        <div className="f s6" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Criar />
          {r.erro && (
            <span style={{ color: "var(--bad)", fontSize: ".86rem" }} aria-live="polite">
              {r.erro}
            </span>
          )}
        </div>
      </form>
      {r.ok && (
        <div className="panel" style={{ marginTop: 12, background: "var(--sunk)" }} aria-live="polite">
          <b>{r.ok}</b>
          <p style={{ marginTop: 6, fontSize: ".9rem" }}>
            E-mail: <code>{r.email}</code>
            {r.senha && (
              <>
                {" · "}Senha provisória: <code>{r.senha}</code>
              </>
            )}
          </p>
          <p className="muted" style={{ fontSize: ".82rem", marginTop: 4 }}>
            A pessoa entra em /entrar, preenche os primeiros passos (CPF ou CNPJ e celular) e pode trocar a senha em Minha conta.
          </p>
        </div>
      )}
    </div>
  );
}
