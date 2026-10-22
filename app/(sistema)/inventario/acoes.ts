"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { contaAtual } from "@/lib/conta";
import { ErroMl } from "@/lib/mercado-livre";
import { importarMercadoLivre, type ResultadoImportacao } from "@/lib/ml-importar";

export type EstadoSinc = { em?: string; resultados?: ResultadoImportacao[]; erros?: string[] };

// Sincroniza todas as contas do Mercado Livre ativas da conta. Uma conta que falha não para as outras.
export async function sincronizar(_: EstadoSinc): Promise<EstadoSinc> {
  const atual = await contaAtual();
  if (!atual) return { erros: ["Sua sessão terminou. Entre de novo."] };

  const conexoes = await obterDb()
    .select({ id: conexoesCanal.id, apelido: conexoesCanal.apelido })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.contaId, atual.conta.id), eq(conexoesCanal.canal, "mercado_livre"), eq(conexoesCanal.situacao, "ativa")));
  if (!conexoes.length) return { erros: ["Nenhuma conta do Mercado Livre conectada. Conecte em Canais."] };

  const resultados: ResultadoImportacao[] = [];
  const erros: string[] = [];
  for (const c of conexoes) {
    try {
      resultados.push(await importarMercadoLivre(c.id));
    } catch (e) {
      // só o código: a mensagem do ML pode trazer dados da conta
      console.error("sincronizar ML falhou:", e instanceof ErroMl ? e.codigo : e);
      const quem = c.apelido ?? "Mercado Livre";
      erros.push(
        e instanceof ErroMl
          ? e.codigo === "reconectar"
            ? `${quem}: a autorização venceu. Reconecte em Canais.`
            : `${quem}: ${e.message}`
          : `${quem}: não deu para sincronizar agora. Tente de novo em alguns minutos.`,
      );
    }
  }
  revalidatePath("/", "layout");
  return { em: new Date().toISOString(), resultados, erros };
}
