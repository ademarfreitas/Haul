// Captação de contato (CRM): a página de cadastro da loja em /c/<codigo>. O comprador deixa nome,
// WhatsApp e aniversário, aceita receber ofertas e ganha o cupom. Regras puras (testes/crm-captacao.test.mjs).
import { dataValida } from "@/lib/crm-funil";
import { celularE164, emailValido } from "@/lib/validar";

// De onde a pessoa chegou. No pacote do marketplace a página não mostra cupom: as regras do ML e da
// Shopee proíbem levar o comprador para comprar fora (decisão em docs/crm.md).
export const DE = {
  loja: { rotulo: "Link da loja (Instagram, balcão, venda direta)", origem: "página de cadastro da loja", cupom: true },
  pacote: { rotulo: "Cartão no pacote", origem: "cartão no pacote (QR)", cupom: false },
} as const;
export type De = keyof typeof DE;
export const deValido = (v: unknown): De => (v === "pacote" ? "pacote" : "loja");

// Código curto da página: sem letras que se confundem (0/O, 1/I/L), fácil de digitar se o QR falhar.
const LETRAS = "abcdefghjkmnpqrstuvwxyz23456789";
export function novoCodigo(aleatorio: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  return Array.from({ length: 7 }, () => LETRAS[aleatorio(LETRAS.length)]).join("");
}
export const codigoValido = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9]{7}$/.test(v);

export const CUPOM_MAX = 20;
export function cupomValido(v: unknown): { ok: string | null } | { erro: string } {
  const t = String(v ?? "").trim().toUpperCase();
  if (!t) return { ok: null };
  if (!/^[A-Z0-9_-]{3,20}$/.test(t)) return { erro: "O cupom tem de ter de 3 a 20 letras ou números, sem espaço." };
  return { ok: t };
}

export type Cadastro = { nome: string; whatsapp: string; email: string | null; aniversario: string | null; pedido: string | null };

// Confere o que a pessoa digitou. Sem aceite não guarda nada: a página existe para isso.
export function validaCadastro(f: Record<string, unknown>): { erro: string } | { ok: Cadastro } {
  const s = (k: string, max: number) => String(f[k] ?? "").trim().slice(0, max);
  const nome = s("nome", 120).replace(/\s+/g, " ");
  const zap = s("whatsapp", 30);
  const email = s("email", 254).toLowerCase();
  const aniversario = s("aniversario", 10);
  const pedido = s("pedido", 40).replace(/[^0-9A-Za-z-]/g, "");
  if (nome.length < 2) return { erro: "Escreva seu nome." };
  const whatsapp = celularE164(zap);
  if (!whatsapp) return { erro: "Digite o WhatsApp com DDD, por exemplo (11) 91234-5678." };
  if (email && !emailValido(email)) return { erro: "Esse e-mail não parece certo." };
  const dia = aniversario ? dataValida(aniversario) : null;
  if (aniversario && !dia) return { erro: "Data de aniversário inválida." };
  if (f.aceite !== "on") return { erro: "Marque que aceita receber novidades para se cadastrar." };
  return { ok: { nome, whatsapp: whatsapp.replace("+", ""), email: email || null, aniversario: dia, pedido: pedido || null } };
}

// O que guardar num cliente que já existe: só preenche o que está vazio, para ninguém trocar o
// WhatsApp de outra pessoa digitando o número do pedido dela.
export function completa<T extends { whatsapp: string | null; email: string | null; aniversario: string | null }>(antes: T, novo: Cadastro) {
  return {
    whatsapp: antes.whatsapp ?? novo.whatsapp,
    email: antes.email ?? novo.email,
    aniversario: antes.aniversario ?? novo.aniversario,
  };
}
