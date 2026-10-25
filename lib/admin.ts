// Área do dono do Plist (/admin). Só entra quem tem o e-mail em ADMIN_EMAILS (separados por vírgula);
// para os outros a página não existe (404), para nem revelar que ela está lá.
import { notFound } from "next/navigation";
import { exigirConta } from "@/lib/conta";

export function ehAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const lista = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return lista.includes(email.trim().toLowerCase());
}

export async function exigirAdmin(aqui: string) {
  const atual = await exigirConta(aqui);
  if (!ehAdmin(atual.usuario.email)) notFound();
  return atual;
}
