"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { contaAtual } from "@/lib/conta";
import { ErroMl } from "@/lib/mercado-livre";
import { importarPedidos, type ResultadoPedidos } from "@/lib/ml-pedidos";

export type EstadoPedidos = { em?: string; resultados?: ResultadoPedidos[]; erros?: string[] };

// Busca as vendas dos últimos 60 dias em cada conta do ML; usado em Pedidos e em Tarefas.
export async function atualizarPedidos(_: EstadoPedidos): Promise<EstadoPedidos> {
  const atual = await contaAtual();
  if (!atual) return { erros: ["Sua sessão terminou. Entre de novo."] };
  const conexoes = await obterDb()
    .select({ id: conexoesCanal.id, apelido: conexoesCanal.apelido })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.contaId, atual.conta.id), eq(conexoesCanal.canal, "mercado_livre"), eq(conexoesCanal.situacao, "ativa")));
  if (!conexoes.length) return { erros: ["Nenhuma conta do Mercado Livre conectada. Conecte em Canais."] };

  const resultados: ResultadoPedidos[] = [];
  const erros: string[] = [];
  for (const c of conexoes) {
    try {
      resultados.push(await importarPedidos(c.id));
    } catch (e) {
      console.error("pedidos ML falhou:", e instanceof ErroMl ? e.codigo : e);
      const quem = c.apelido ?? "Mercado Livre";
      erros.push(e instanceof ErroMl && e.codigo === "reconectar" ? `${quem}: reconecte em Canais.` : `${quem}: não deu para buscar os pedidos agora.`);
    }
  }
  revalidatePath("/", "layout");
  return { em: new Date().toISOString(), resultados, erros };
}
