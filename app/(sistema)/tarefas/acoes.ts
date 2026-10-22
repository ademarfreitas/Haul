"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { tarefas } from "@/db/schema";
import { contaAtual } from "@/lib/conta";

// Concluir ou ignorar uma tarefa da própria conta.
export async function fecharTarefa(f: FormData): Promise<void> {
  const atual = await contaAtual();
  if (!atual) return;
  const id = String(f.get("id") ?? "");
  const como = f.get("como") === "ignorada" ? "ignorada" : "concluida";
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await obterDb()
    .update(tarefas)
    .set({ situacao: como, concluidaEm: new Date() })
    .where(and(eq(tarefas.id, id), eq(tarefas.contaId, atual.conta.id)));
  revalidatePath("/", "layout");
}

export async function reabrirTarefa(f: FormData): Promise<void> {
  const atual = await contaAtual();
  if (!atual) return;
  const id = String(f.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await obterDb()
    .update(tarefas)
    .set({ situacao: "aberta", concluidaEm: null })
    .where(and(eq(tarefas.id, id), eq(tarefas.contaId, atual.conta.id)));
  revalidatePath("/", "layout");
}
