import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { CANAIS, CANAIS_PRONTOS, ERROS_ML, type Canal } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";

export const dynamic = "force-dynamic";
export const metadata = { title: "Canais · Plist" };

const SITUACAO = { ativa: ["p-good", "Conectada"], expirada: ["p-bad", "Reconectar"], revogada: ["p-bad", "Revogada"] } as const;

export default async function Canais({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ml, ml_erro, faltando } = await searchParams;
  const { conta } = await exigirConta("/canais");

  const conexoes = await obterDb()
    .select()
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.contaId, conta.id), eq(conexoesCanal.canal, "mercado_livre")));

  const outros = (Object.keys(CANAIS) as Canal[]).filter((c) => c !== "venda_direta" && !CANAIS_PRONTOS.includes(c));

  return (
    <>
      <header className="vhead">
        <div>
          <h1>Canais</h1>
          <p className="sub">Conecte suas contas de marketplace. O Plist guarda só a autorização, cifrada.</p>
        </div>
      </header>

      {ml === "conectado" && <div className="trialbar" style={{ background: "var(--good-soft)", color: "var(--good)" }}>Mercado Livre conectado.</div>}
      {ml_erro === "config_incompleta" ? (
        <div className="trialbar bad">
          Falta configurar no servidor: {(faltando ?? "").split(",").filter((n) => /^ML_[A-Z_]+$/.test(n)).join(", ") || "?"}. Confira o nome exato (tudo maiúsculo) nas
          variáveis de ambiente de Production e faça Redeploy.
        </div>
      ) : (
        ml_erro && <div className="trialbar bad">{ERROS_ML[ml_erro] ?? `Não deu para conectar (${ml_erro}).`}</div>
      )}

      <div className="cgrid">
        <div className="cc">
          <div className="top">
            <div className="nm">
              <span className="plogo" style={{ ["--c" as string]: "var(--c-ml)" }} aria-hidden="true">ML</span>
              Mercado Livre
            </div>
            {conexoes.length > 0 && <span className="pill p-good">{conexoes.length === 1 ? "1 conta" : `${conexoes.length} contas`}</span>}
          </div>
          {conexoes.length === 0 && <p className="muted">Nenhuma conta conectada.</p>}
          {conexoes.map((c) => {
            const [cls, txt] = SITUACAO[c.situacao];
            return (
              <div key={c.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <div className="top" style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <b>{c.apelido ?? c.usuarioExterno}</b>
                  <span className={`pill ${cls}`}>{txt}</span>
                </div>
                <dl style={{ marginTop: 8 }}>
                  <dt>Vendedor</dt>
                  <dd className="num">{c.usuarioExterno}</dd>
                  {c.tokenExpiraEm && (
                    <>
                      <dt>Acesso renova</dt>
                      <dd>{c.tokenExpiraEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</dd>
                    </>
                  )}
                </dl>
                <div className="actions" style={{ marginTop: 8 }}>
                  {c.situacao === "ativa" ? (
                    <a className="btn small" href={`/api/canais/mercado-livre/testar?id=${c.id}`}>Testar</a>
                  ) : (
                    <a className="btn small primary" href="/api/canais/mercado-livre/conectar">Reconectar</a>
                  )}
                </div>
              </div>
            );
          })}
          <a className="btn primary" href="/api/canais/mercado-livre/conectar" style={{ justifyContent: "center", textDecoration: "none" }}>
            {conexoes.length ? "Conectar outra conta" : "Conectar Mercado Livre"}
          </a>
        </div>

        {outros.map((c) => (
          <div className="cc" key={c}>
            <div className="top">
              <div className="nm">
                <span className="plogo" style={{ ["--c" as string]: `var(--c-${CANAIS[c].cor})` }} aria-hidden="true">{CANAIS[c].sigla}</span>
                {CANAIS[c].nome}
              </div>
              <span className="pill p-muted">Em breve</span>
            </div>
            <p className="muted" style={{ fontSize: ".84rem" }}>{CANAIS[c].descricao}</p>
          </div>
        ))}
      </div>
    </>
  );
}
