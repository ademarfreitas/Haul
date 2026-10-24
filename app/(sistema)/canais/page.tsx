import { eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { CANAIS, CANAIS_PRONTOS, CONECTAR, ERROS_AMAZON, ERROS_ML, ERROS_SHOPEE, type Canal } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";

export const dynamic = "force-dynamic";
export const metadata = { title: "Canais · Plist" };

const SITUACAO = { ativa: ["p-good", "Conectada"], expirada: ["p-bad", "Reconectar"], revogada: ["p-bad", "Revogada"] } as const;

// o que muda de um canal pronto para outro na tela: rota de teste, rótulo do id e prefixo das variáveis
const DETALHE: Partial<Record<Canal, { testar: string; idExterno: string; conectar: string; variaveis: RegExp }>> = {
  mercado_livre: { testar: "/api/canais/mercado-livre/testar", idExterno: "Vendedor", conectar: "Conectar Mercado Livre", variaveis: /^ML_[A-Z_]+$/ },
  shopee: { testar: "/api/canais/shopee/testar", idExterno: "Loja", conectar: "Conectar Shopee", variaveis: /^SHOPEE_[A-Z_]+$/ },
  amazon: { testar: "/api/canais/amazon/testar", idExterno: "Vendedor", conectar: "Conectar Amazon", variaveis: /^AMAZON_[A-Z_]+$/ },
};

export default async function Canais({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ml, ml_erro, shopee, shopee_erro, amazon, amazon_erro, faltando } = await searchParams;
  const { conta } = await exigirConta("/canais");

  const conexoes = await obterDb().select().from(conexoesCanal).where(eq(conexoesCanal.contaId, conta.id));

  const outros = (Object.keys(CANAIS) as Canal[]).filter((c) => c !== "venda_direta" && !CANAIS_PRONTOS.includes(c));
  const ok = ml === "conectado" ? "Mercado Livre conectado." : shopee === "conectado" ? "Shopee conectada." : amazon === "conectado" ? "Amazon conectada." : null;
  const erro = ml_erro ? { canal: "mercado_livre" as const, codigo: ml_erro, textos: ERROS_ML } : shopee_erro
      ? { canal: "shopee" as const, codigo: shopee_erro, textos: ERROS_SHOPEE }
      : amazon_erro
        ? { canal: "amazon" as const, codigo: amazon_erro, textos: ERROS_AMAZON }
        : null;

  return (
    <>
      <header className="vhead">
        <div>
          <h1>Canais</h1>
          <p className="sub">Conecte suas contas de marketplace. O Plist guarda só a autorização, cifrada.</p>
        </div>
      </header>

      {ok && <div className="trialbar" style={{ background: "var(--good-soft)", color: "var(--good)" }}>{ok}</div>}
      {erro?.codigo === "config_incompleta" ? (
        <div className="trialbar bad">
          Falta configurar no servidor: {(faltando ?? "").split(",").filter((n) => DETALHE[erro.canal]!.variaveis.test(n)).join(", ") || "?"}. Confira o nome exato (tudo maiúsculo) nas
          variáveis de ambiente de Production e faça Redeploy.
        </div>
      ) : (
        erro && <div className="trialbar bad">{erro.textos[erro.codigo] ?? `Não deu para conectar (${erro.codigo}).`}</div>
      )}

      <div className="cgrid">
        {CANAIS_PRONTOS.map((canal) => {
          const det = DETALHE[canal]!;
          const doCanal = conexoes.filter((c) => c.canal === canal);
          return (
            <div className="cc" key={canal}>
              <div className="top">
                <div className="nm">
                  <span className="plogo" style={{ ["--c" as string]: `var(--c-${CANAIS[canal].cor})` }} aria-hidden="true">{CANAIS[canal].sigla}</span>
                  {CANAIS[canal].nome}
                </div>
                {doCanal.length > 0 && <span className="pill p-good">{doCanal.length === 1 ? "1 conta" : `${doCanal.length} contas`}</span>}
              </div>
              {doCanal.length === 0 && <p className="muted">Nenhuma conta conectada.</p>}
              {doCanal.map((c) => {
                const [cls, txt] = SITUACAO[c.situacao];
                return (
                  <div key={c.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                    <div className="top" style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <b>{c.apelido ?? c.usuarioExterno}</b>
                      <span className={`pill ${cls}`}>{txt}</span>
                    </div>
                    <dl style={{ marginTop: 8 }}>
                      <dt>{det.idExterno}</dt>
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
                        <a className="btn small" href={`${det.testar}?id=${c.id}`}>Testar</a>
                      ) : (
                        <a className="btn small primary" href={CONECTAR[canal]}>Reconectar</a>
                      )}
                    </div>
                  </div>
                );
              })}
              <a className="btn primary" href={CONECTAR[canal]} style={{ justifyContent: "center", textDecoration: "none" }}>
                {doCanal.length ? "Conectar outra conta" : det.conectar}
              </a>
            </div>
          );
        })}

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
