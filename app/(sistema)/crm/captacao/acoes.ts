"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { captacoes } from "@/db/schema";
import { contaComCrm } from "@/lib/crm";
import { cupomValido, novoCodigo } from "@/lib/crm-captacao";

export type Resposta = { ok?: string; erro?: string };

// A página da conta, criada na primeira visita à aba Captação. O código não muda (já pode estar impresso).
export async function captacaoDaConta(contaId: string) {
  const db = obterDb();
  for (let i = 0; i < 5; i++) {
    const [atual] = await db.select().from(captacoes).where(eq(captacoes.contaId, contaId));
    if (atual) return atual;
    // código repetido de outra conta (unique) ou duas abas ao mesmo tempo: tenta de novo
    await db.insert(captacoes).values({ contaId, codigo: novoCodigo() }).onConflictDoNothing();
  }
  throw new Error("Não deu para criar a página de cadastro.");
}

export async function salvarCaptacao(_: Resposta, f: FormData): Promise<Resposta> {
  const atual = await contaComCrm();
  if (!atual) return { erro: "O CRM é do plano Avançado." };
  const cupom = cupomValido(f.get("cupom"));
  if ("erro" in cupom) return cupom;
  const beneficio = String(f.get("beneficio") ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || null;
  if (cupom.ok && !beneficio) return { erro: "Diga o que o cupom dá, por exemplo: 10% na próxima compra." };
  if (beneficio && !cupom.ok) return { erro: "Escreva o código do cupom." };
  await captacaoDaConta(atual.conta.id);
  await obterDb().update(captacoes).set({ cupom: cupom.ok, beneficio }).where(eq(captacoes.contaId, atual.conta.id));
  revalidatePath("/crm/captacao");
  return { ok: "Salvo." };
}
