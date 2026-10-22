"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { contas, usuarios } from "@/db/schema";
import { contaAtual } from "@/lib/conta";
import { PLANOS } from "@/lib/planos";
import { conferirSenha, gerarHash, SENHA_MINIMA } from "@/lib/senha";
import { celularE164 } from "@/lib/validar";

export type Resposta = { ok?: string; erro?: string };

const texto = (f: FormData, nome: string, max = 200) => String(f.get(nome) ?? "").trim().slice(0, max);

export async function salvarGeral(_: Resposta, f: FormData): Promise<Resposta> {
  const atual = await contaAtual();
  if (!atual) return { erro: "Sua sessão terminou. Entre de novo." };
  const nome = texto(f, "nome", 120).replace(/\s+/g, " ");
  const celularDigitado = texto(f, "celular", 30);
  if (nome.split(" ").length < 2) return { erro: "Escreva nome e sobrenome." };
  const celular = celularDigitado ? celularE164(celularDigitado) : null;
  if (celularDigitado && !celular) return { erro: "Digite um celular com DDD, por exemplo (11) 91234-5678." };

  const db = obterDb();
  await db.update(usuarios).set({ nome }).where(eq(usuarios.id, atual.usuario.id));
  await db.update(contas).set({ celular }).where(eq(contas.id, atual.conta.id));
  // pessoa física: o nome da conta é o da pessoa (na PJ é a razão social, que não muda aqui)
  if (atual.conta.tipoPessoa !== "pj") await db.update(contas).set({ nome }).where(eq(contas.id, atual.conta.id));
  revalidatePath("/minha-conta");
  return { ok: "Alterações salvas." };
}

// Só registra a escolha: a cobrança começa no fim do teste, quando o provedor de cobrança estiver ligado.
export async function escolherPlano(f: FormData): Promise<void> {
  const atual = await contaAtual();
  if (!atual) return;
  const plano = PLANOS.find((p) => p.id === texto(f, "plano", 20));
  if (!plano) return;
  await obterDb().update(contas).set({ plano: plano.id }).where(eq(contas.id, atual.conta.id));
  revalidatePath("/minha-conta");
}

export async function trocarSenha(_: Resposta, f: FormData): Promise<Resposta> {
  const atual = await contaAtual();
  if (!atual) return { erro: "Sua sessão terminou. Entre de novo." };
  const agora = String(f.get("atual") ?? "");
  const nova = String(f.get("nova") ?? "");
  const repetida = String(f.get("repetida") ?? "");
  if (nova.length < SENHA_MINIMA) return { erro: `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.` };
  if (nova.length > 200) return { erro: "Essa senha é longa demais." };
  if (nova !== repetida) return { erro: "As duas senhas novas não são iguais." };

  const db = obterDb();
  const [u] = await db.select({ senhaHash: usuarios.senhaHash }).from(usuarios).where(eq(usuarios.id, atual.usuario.id));
  if (!(await conferirSenha(agora.slice(0, 200), u?.senhaHash))) return { erro: "A senha atual não confere." };
  await db.update(usuarios).set({ senhaHash: await gerarHash(nova) }).where(eq(usuarios.id, atual.usuario.id));
  return { ok: "Senha alterada." };
}
