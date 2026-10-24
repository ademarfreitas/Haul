"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { CANAIS } from "@/lib/canais";
import { contaAtual } from "@/lib/conta";
import { ErroMl } from "@/lib/mercado-livre";
import { importarMercadoLivre, type ResultadoImportacao } from "@/lib/ml-importar";
import { ErroShein } from "@/lib/shein";
import { importarShein } from "@/lib/shein-importar";
import { ErroShopee } from "@/lib/shopee";
import { importarShopee } from "@/lib/shopee-importar";

export type EstadoSinc = { em?: string; resultados?: ResultadoImportacao[]; erros?: string[] };

const IMPORTAR = { mercado_livre: importarMercadoLivre, shopee: importarShopee, shein: importarShein } as const;

// Sincroniza todas as contas ativas da conta (Mercado Livre, Shopee e Shein). Uma conta que falha não para as outras.
export async function sincronizar(_: EstadoSinc): Promise<EstadoSinc> {
  const atual = await contaAtual();
  if (!atual) return { erros: ["Sua sessão terminou. Entre de novo."] };

  const conexoes = await obterDb()
    .select({ id: conexoesCanal.id, canal: conexoesCanal.canal, apelido: conexoesCanal.apelido })
    .from(conexoesCanal)
    .where(
      and(
        eq(conexoesCanal.contaId, atual.conta.id),
        inArray(conexoesCanal.canal, Object.keys(IMPORTAR) as (keyof typeof IMPORTAR)[]),
        eq(conexoesCanal.situacao, "ativa"),
      ),
    );
  if (!conexoes.length) return { erros: ["Nenhuma conta conectada. Conecte o Mercado Livre, a Shopee ou a Shein em Canais."] };

  const resultados: ResultadoImportacao[] = [];
  const erros: string[] = [];
  // ML primeiro: assim a peça já existe quando o anúncio da Shopee ou da Shein de mesmo SKU chega
  const ordem = [...conexoes].sort((a, b) => (a.canal === b.canal ? 0 : a.canal === "mercado_livre" ? -1 : 1));
  for (const c of ordem) {
    try {
      resultados.push(await IMPORTAR[c.canal as keyof typeof IMPORTAR](c.id));
    } catch (e) {
      const erroCanal = e instanceof ErroMl || e instanceof ErroShopee || e instanceof ErroShein ? e : null;
      // só o código: a mensagem do canal pode trazer dados da conta
      console.error(`sincronizar ${c.canal} falhou:`, erroCanal ? erroCanal.codigo : e);
      const quem = c.apelido ?? CANAIS[c.canal].nome;
      erros.push(
        erroCanal
          ? erroCanal.codigo === "reconectar"
            ? `${quem}: a autorização venceu. Reconecte em Canais.`
            : `${quem}: ${erroCanal.message}`
          : `${quem}: não deu para sincronizar agora. Tente de novo em alguns minutos.`,
      );
    }
  }
  revalidatePath("/", "layout");
  return { em: new Date().toISOString(), resultados, erros };
}
