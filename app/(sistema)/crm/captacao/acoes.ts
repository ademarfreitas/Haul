"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { contas } from "@/db/schema";
import { contaComCrm } from "@/lib/crm";
import { cupomValido, novoCodigo } from "@/lib/crm-captacao";

export type Resposta = { ok?: string; erro?: string };

// O código da página nasce na primeira visita à aba Captação e não muda (já pode estar impresso).
export async function garantirCodigo(contaId: string, atual: string | null): Promise<string> {
  if (atual) return atual;
  const db = obterDb();
  for (let i = 0; i < 5; i++) {
    try {
      const [r] = await db
        .update(contas)
        .set({ captacaoCodigo: novoCodigo() })
        .where(and(eq(contas.id, contaId), isNull(contas.captacaoCodigo)))
        .returning({ codigo: contas.captacaoCodigo });
      if (r?.codigo) return r.codigo;
      const [c] = await db.select({ codigo: contas.captacaoCodigo }).from(contas).where(eq(contas.id, contaId));
      if (c?.codigo) return c.codigo;
    } catch {
      // código repetido (unique): sorteia outro
    }
  }
  throw new Error("Não deu para criar o código da página de cadastro.");
}

export async function salvarCaptacao(_: Resposta, f: FormData): Promise<Resposta> {
  const atual = await contaComCrm();
  if (!atual) return { erro: "O CRM é do plano Avançado." };
  const cupom = cupomValido(f.get("cupom"));
  if ("erro" in cupom) return cupom;
  const beneficio = String(f.get("beneficio") ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || null;
  if (cupom.ok && !beneficio) return { erro: "Diga o que o cupom dá, por exemplo: 10% na próxima compra." };
  if (beneficio && !cupom.ok) return { erro: "Escreva o código do cupom." };
  await obterDb().update(contas).set({ captacaoCupom: cupom.ok, captacaoBeneficio: beneficio }).where(eq(contas.id, atual.conta.id));
  revalidatePath("/crm/captacao");
  return { ok: "Salvo." };
}
