import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { contaDaSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

// textos para os códigos que o callback devolve em ?ml_erro=
const ERROS: Record<string, string> = {
  access_denied: "Você não autorizou o Plist no Mercado Livre.",
  state_invalido: "A conexão expirou ou veio de outra aba. Tente de novo.",
  sem_sessao: "Entre na sua conta do Plist antes de conectar.",
  conta_fora_do_brasil: "Essa conta do Mercado Livre não é do Brasil.",
  conta_ja_conectada: "Essa conta do Mercado Livre já está ligada a outra conta do Plist.",
  invalid_client: "Client ID ou Secret do app do Mercado Livre não conferem (ver .env.local).",
  ml_indisponivel: "O Mercado Livre não respondeu. Tente de novo em alguns minutos.",
  invalid_grant: "O Mercado Livre recusou o código. Confira se o Redirect URI do app é igual ao ML_REDIRECT_URI.",
};

const SITUACAO = { ativa: "Conectada", expirada: "Reconectar", revogada: "Revogada" } as const;

export default async function Canais({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ml, ml_erro, faltando } = await searchParams;
  const contaId = await contaDaSessao();

  const conexoes = contaId
    ? await obterDb()
        .select()
        .from(conexoesCanal)
        .where(and(eq(conexoesCanal.contaId, contaId), eq(conexoesCanal.canal, "mercado_livre")))
    : [];

  return (
    <main>
      <h1>Canais</h1>
      <p className="suave">Conecte suas contas de marketplace. O Plist guarda só a autorização, cifrada.</p>

      {ml === "conectado" && <div className="aviso ok">Mercado Livre conectado.</div>}
      {ml_erro === "config_incompleta" ? (
        <div className="aviso erro">
          Falta configurar no servidor: {(faltando ?? "").split(",").filter((n) => /^ML_[A-Z_]+$/.test(n)).join(", ") || "?"}. Confira o nome exato (tudo maiúsculo) nas variáveis de
          ambiente de Production e faça Redeploy.
        </div>
      ) : (
        ml_erro && <div className="aviso erro">{ERROS[ml_erro] ?? `Não deu para conectar (${ml_erro}).`}</div>
      )}

      {!contaId ? (
        <div className="cartao">
          <p>Você não entrou numa conta. Enquanto o cadastro não existe, use o link da conta de desenvolvimento
            (o LEIA-ME explica).</p>
        </div>
      ) : (
        <div className="cartao">
          <div className="linha">
            <div>
              <strong>Mercado Livre</strong>
              <div className="suave">{conexoes.length ? `${conexoes.length} conta(s) conectada(s)` : "Nenhuma conta conectada"}</div>
            </div>
            <a className="botao" href="/api/canais/mercado-livre/conectar">
              {conexoes.length ? "Conectar outra conta" : "Conectar Mercado Livre"}
            </a>
          </div>
          {conexoes.map((c) => (
            <div className="linha cartao" key={c.id}>
              <div>
                <strong>{c.apelido ?? c.usuarioExterno}</strong>{" "}
                <span className={`selo ${c.situacao}`}>{SITUACAO[c.situacao]}</span>
                <div className="suave">
                  Vendedor {c.usuarioExterno}
                  {c.tokenExpiraEm && ` · acesso renova em ${c.tokenExpiraEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`}
                </div>
              </div>
              {c.situacao === "ativa" ? (
                <a className="botao secundario" href={`/api/canais/mercado-livre/testar?id=${c.id}`}>Testar</a>
              ) : (
                <a className="botao" href="/api/canais/mercado-livre/conectar">Reconectar</a>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
