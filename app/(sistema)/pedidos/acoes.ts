"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { CANAIS } from "@/lib/canais";
import { contaAtual } from "@/lib/conta";
import { ErroMl } from "@/lib/mercado-livre";
import { importarPedidos, type ResultadoPedidos } from "@/lib/ml-pedidos";
import { ErroShein } from "@/lib/shein";
import { importarPedidosShein } from "@/lib/shein-pedidos";
import { ErroShopee } from "@/lib/shopee";
import { ErroAmazon } from "@/lib/amazon";
import { ErroMagalu } from "@/lib/magalu";
import { importarPedidosMagalu } from "@/lib/magalu-pedidos";
import { importarPedidosAmazon } from "@/lib/amazon-pedidos";
import { importarPedidosShopee } from "@/lib/shopee-pedidos";

const IMPORTAR = { mercado_livre: importarPedidos, shopee: importarPedidosShopee, shein: importarPedidosShein, amazon: importarPedidosAmazon, magalu: importarPedidosMagalu } as const;

export type EstadoPedidos = { em?: string; resultados?: ResultadoPedidos[]; erros?: string[] };

// Busca as vendas dos últimos 60 dias em cada conta do ML, loja da Shopee e da Shein e conta da Amazon e da Magalu; usado em Pedidos e em Tarefas.
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
  if (!conexoes.length) return { erros: ["Nenhuma conta conectada. Conecte o Mercado Livre, a Shopee, a Shein, a Amazon ou a Magalu em Canais."] };

  const resultados: ResultadoPedidos[] = [];
  const erros: string[] = [];
  for (const c of conexoes) {
    try {
      resultados.push(await IMPORTAR[c.canal as keyof typeof IMPORTAR](c.id));
    } catch (e) {
      const erroCanal = e instanceof ErroMl || e instanceof ErroShopee || e instanceof ErroAmazon || e instanceof ErroMagalu || e instanceof ErroShein ? e : null;
      console.error(`pedidos ${c.canal} falhou:`, erroCanal ? erroCanal.codigo : e);
      const quem = c.apelido ?? CANAIS[c.canal].nome;
      erros.push(erroCanal?.codigo === "reconectar" ? `${quem}: reconecte em Canais.` : `${quem}: não deu para buscar os pedidos agora.`);
    }
  }
  revalidatePath("/", "layout");
  return { em: new Date().toISOString(), resultados, erros };
}
