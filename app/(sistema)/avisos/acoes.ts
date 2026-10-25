"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterDb } from "@/db/cliente";
import { contas } from "@/db/schema";
import { contaAtual } from "@/lib/conta";

// O que chega por e-mail. Caixa desmarcada não vem no formulário: ausente = desligado.
export async function salvarAvisos(f: FormData): Promise<void> {
  const atual = await contaAtual();
  if (!atual) return;
  await obterDb()
    .update(contas)
    .set({ avisosEmail: { custo: f.get("custo") === "1", estoque: f.get("estoque") === "1" } })
    .where(eq(contas.id, atual.conta.id));
  revalidatePath("/avisos");
  redirect("/avisos?salvo=1");
}
