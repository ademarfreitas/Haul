"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { CANAIS } from "@/lib/canais";
import { contaAtual } from "@/lib/conta";
import { ErroMl } from "@/lib/mercado-livre";
import { importarPedidos, type ResultadoPedidos } from "@/lib/ml-pedidos";
import { ErroShopee } from "@/lib/shopee";
import { importarPedidosShopee } from "@/lib/shopee-pedidos";

const IMPORTAR = { mercado_livre: importarPedidos, shopee: importarPedidosShopee } as const;

export type EstadoPedidos = { em?: string; resultados?: ResultadoPedidos[]; erros?: string[] };

// Busca as vendas dos últimos 60 dias em cada conta do ML e loja da Shopee; usado em Pedidos e em Tarefas.
export async function atualizarPedidos(_: EstadoPedidos): Promise<EstadoPedidos> {
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
  if (!conexoes.length) return { erros: ["Nenhuma conta conectada. Conecte o Mercado Livre ou a Shopee em Canais."] };

  const resultados: ResultadoPedidos[] = [];
  const erros: string[] = [];
  for (const c of conexoes) {
    try {
      resultados.push(await IMPORTAR[c.canal as keyof typeof IMPORTAR](c.id));
    } catch (e) {
      const erroCanal = e instanceof ErroMl || e instanceof ErroShopee ? e : null;
      console.error(`pedidos ${c.canal} falhou:`, erroCanal ? erroCanal.codigo : e);
      const quem = c.apelido ?? CANAIS[c.canal].nome;
      erros.push(erroCanal?.codigo === "reconectar" ? `${quem}: reconecte em Canais.` : `${quem}: não deu para buscar os pedidos agora.`);
    }
  }
  revalidatePath("/", "layout");
  return { em: new Date().toISOString(), resultados, erros };
}
