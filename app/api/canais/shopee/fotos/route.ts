// Recebe uma foto do anúncio novo da Shopee (já reduzida no navegador) e guarda no espaço de mídia dela.
// Uma foto por chamada, para ficar longe do limite de tamanho de requisição da Vercel (4,5 MB).
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { contaDaSessao } from "@/lib/sessao";
import { enviarImagemShopee, ErroShopee } from "@/lib/shopee";

const TIPOS = ["image/jpeg", "image/png"];
const MAXIMO = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const contaId = await contaDaSessao();
  if (!contaId) return NextResponse.json({ erro: "Sua sessão terminou. Entre de novo." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("foto");
  const conexaoId = String(form?.get("conexao") ?? "");
  if (!(arquivo instanceof Blob) || !TIPOS.includes(arquivo.type)) {
    return NextResponse.json({ erro: "Envie uma foto JPG ou PNG." }, { status: 400 });
  }
  if (arquivo.size > MAXIMO) return NextResponse.json({ erro: "Foto grande demais (máximo 4 MB)." }, { status: 413 });

  // a foto sobe pela plataforma, mas só quem tem loja da Shopee conectada pode usar
  const [c] = await obterDb()
    .select({ id: conexoesCanal.id })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.id, conexaoId), eq(conexoesCanal.contaId, contaId), eq(conexoesCanal.canal, "shopee")));
  if (!c) return NextResponse.json({ erro: "Conecte a Shopee antes de enviar fotos." }, { status: 400 });

  try {
    return NextResponse.json(await enviarImagemShopee(arquivo, "foto.jpg"));
  } catch (e) {
    console.error("foto para a Shopee falhou:", e instanceof ErroShopee ? e.codigo : e);
    return NextResponse.json({ erro: e instanceof ErroShopee ? e.message : "Não deu para enviar a foto." }, { status: e instanceof ErroShopee ? e.status : 500 });
  }
}
