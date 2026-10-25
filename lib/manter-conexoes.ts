// Mantém as conexões dos canais vivas sem o lojista reconectar.
// A conexão é da conta do Plist (tabela conexoes_canal), não da sessão: sair e entrar não a apaga.
// O que derruba uma conexão é o refresh token vencer sem uso (Shopee ~30 dias, ML 6 meses) ou o
// lojista tirar a autorização no marketplace. Por isso a renovação roda no login e uma vez por dia
// (app/api/cron/conexoes): cada renovação devolve um refresh token novo, que recomeça a contagem.
// Se o marketplace recusar, a função de cada canal já marca "expirada" e abre a tarefa "Reconectar".
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import type { Canal } from "@/lib/canais";
import { contaAmazonValida } from "@/lib/amazon";
import { lojaMagaluValida } from "@/lib/magalu";
import { tokenValido } from "@/lib/mercado-livre";
import { lojaValida } from "@/lib/shopee";

// Cada uma devolve o token vigente e renova se estiver vencido ou para vencer.
// A Shein fica de fora: as chaves da loja não vencem (só caem se o lojista revogar).
const RENOVAR: Partial<Record<Canal, (conexaoId: string) => Promise<unknown>>> = {
  mercado_livre: tokenValido,
  shopee: lojaValida,
  amazon: contaAmazonValida,
  magalu: lojaMagaluValida,
};

export type Resumo = { conferidas: number; caidas: number; falhas: number };

const codigoDe = (e: unknown) => (e && typeof e === "object" && "codigo" in e ? String((e as { codigo: unknown }).codigo) : "falha_interna");

// Confere as conexões ativas (de uma conta, ou de todas sem contaId). Uma por vez, para não
// estourar o limite de chamadas de nenhum marketplace.
export async function manterConexoes(contaId?: string): Promise<Resumo> {
  const filtros = [eq(conexoesCanal.situacao, "ativa")];
  if (contaId) filtros.push(eq(conexoesCanal.contaId, contaId));
  const lista = await obterDb()
    .select({ id: conexoesCanal.id, canal: conexoesCanal.canal })
    .from(conexoesCanal)
    .where(and(...filtros));

  const resumo: Resumo = { conferidas: 0, caidas: 0, falhas: 0 };
  for (const c of lista) {
    const renovar = RENOVAR[c.canal];
    if (!renovar) continue;
    try {
      await renovar(c.id);
      resumo.conferidas++;
    } catch (e) {
      // "reconectar" = o marketplace recusou: a conexão já ficou "expirada" com tarefa aberta.
      // Outro erro (rede, marketplace fora do ar) não derruba nada: tenta de novo na próxima vez.
      const codigo = codigoDe(e);
      if (codigo === "reconectar") resumo.caidas++;
      else resumo.falhas++;
      // só canal e código: a mensagem pode ter dados da conta
      console.error("renovar conexão falhou:", c.canal, codigo);
    }
  }
  return resumo;
}
