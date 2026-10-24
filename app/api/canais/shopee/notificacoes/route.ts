// Avisos da Shopee (push): pedido novo, mudança de status, autorização cancelada...
// A Shopee espera 2xx rápido e reenvia se não receber, então aqui só guardamos em eventos_canal
// (sem duplicar) e o processamento fica para depois. Formato: { shop_id, code, timestamp, data }.
// O endereço é público: só vale aviso com a assinatura da Shopee no cabeçalho Authorization.
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal, eventosCanal } from "@/db/schema";
import { avisoAutentico } from "@/lib/shopee";

type Aviso = { shop_id?: number; code?: number; timestamp?: number; data?: unknown };

export async function POST(req: Request) {
  const corpo = await req.text();
  // a assinatura cobre o endereço cadastrado no console, que é o público (APP_URL), não o interno
  const url = `${process.env.APP_URL ?? new URL(req.url).origin}/api/canais/shopee/notificacoes`;
  if (!avisoAutentico(url, corpo, req.headers.get("authorization"))) return new Response(null, { status: 401 });

  let aviso: Aviso;
  try {
    aviso = JSON.parse(corpo) as Aviso;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (aviso.code === undefined) return new Response(null, { status: 400 });

  const db = obterDb();
  const [conexao] = aviso.shop_id
    ? await db
        .select({ id: conexoesCanal.id })
        .from(conexoesCanal)
        .where(and(eq(conexoesCanal.canal, "shopee"), eq(conexoesCanal.usuarioExterno, String(aviso.shop_id))))
    : [];

  // o aviso não traz id próprio: o hash do corpo evita gravar o mesmo reenvio duas vezes
  const idExterno = createHash("sha256").update(corpo).digest("hex");
  await db
    .insert(eventosCanal)
    .values({ canal: "shopee", idExterno, topico: `push_${aviso.code}`, conexaoId: conexao?.id, payload: aviso })
    .onConflictDoNothing();
  return new Response(null, { status: 200 });
}
