// Recebe uma foto do Novo anúncio (já reduzida no navegador) e guarda no Mercado Livre.
// Uma foto por chamada, para ficar longe do limite de tamanho de requisição da Vercel (4,5 MB).
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { contaDaSessao } from "@/lib/sessao";
import { ErroMl, tokenValido } from "@/lib/mercado-livre";
import { enviarFoto } from "@/lib/ml-anuncio";

const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const MAXIMO = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const contaId = await contaDaSessao();
  if (!contaId) return NextResponse.json({ erro: "Sua sessão terminou. Entre de novo." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("foto");
  const conexaoId = String(form?.get("conexao") ?? "");
  if (!(arquivo instanceof Blob) || !TIPOS.includes(arquivo.type)) {
    return NextResponse.json({ erro: "Envie uma foto JPG, PNG ou WebP." }, { status: 400 });
  }
  if (arquivo.size > MAXIMO) return NextResponse.json({ erro: "Foto grande demais (máximo 4 MB)." }, { status: 413 });

  const [c] = await obterDb()
    .select({ id: conexoesCanal.id })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.id, conexaoId), eq(conexoesCanal.contaId, contaId)));
  if (!c) return NextResponse.json({ erro: "Conecte o Mercado Livre antes de enviar fotos." }, { status: 400 });

  try {
    const foto = await enviarFoto(await tokenValido(c.id), arquivo, "foto.jpg");
    return NextResponse.json(foto);
  } catch (e) {
    console.error("foto para o ML falhou:", e instanceof ErroMl ? e.codigo : e);
    const msg = e instanceof ErroMl ? (e.codigo === "reconectar" ? "Reconecte o Mercado Livre em Canais." : e.message) : "Não deu para enviar a foto.";
    return NextResponse.json({ erro: msg }, { status: e instanceof ErroMl ? e.status : 500 });
  }
}
