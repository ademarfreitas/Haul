// Avisos da Magalu (webhooks v1): { topic, tenant_id, data: { status, params, resource } }.
// O aviso só diz que algo mudou; o Plist guarda em eventos_canal (sem duplicar), responde rápido e, se for
// de pedido ou entrega, busca as vendas daquela loja depois da resposta.
// O endereço é público: só vale aviso com a assinatura (X-Signature-256 + X-Timestamp) feita com o
// segredo que a Magalu devolveu na inscrição (MAGALU_WEBHOOK_SECRET).
import { createHash } from "node:crypto";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal, eventosCanal } from "@/db/schema";
import { processarAvisosDePedido, TOPICOS_PEDIDO } from "@/lib/eventos";
import { avisoAutenticoMagalu } from "@/lib/magalu";

export const maxDuration = 60;

type Aviso = { topic?: string; tenant_id?: string; data?: { status?: string; resource?: string; params?: Record<string, unknown> } };

export async function POST(req: Request) {
  const corpo = await req.text();
  if (!avisoAutenticoMagalu(corpo, req.headers.get("x-signature-256"), req.headers.get("x-timestamp"))) return new Response(null, { status: 401 });

  let aviso: Aviso;
  try {
    aviso = JSON.parse(corpo) as Aviso;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!aviso.topic) return new Response(null, { status: 400 });

  const db = obterDb();
  const [conexao] = aviso.tenant_id
    ? await db
        .select({ id: conexoesCanal.id })
        .from(conexoesCanal)
        .where(and(eq(conexoesCanal.canal, "magalu"), eq(conexoesCanal.usuarioExterno, aviso.tenant_id)))
    : [];

  // os nomes exatos dos tópicos de pedido não estão na documentação: tudo que fala de pedido ou entrega conta
  const topico = /order|deliver|pedido|entrega/i.test(aviso.topic) ? "pedido" : aviso.topic.slice(0, 60);
  const idExterno = createHash("sha256").update(corpo).digest("hex");
  await db
    .insert(eventosCanal)
    .values({ canal: "magalu", idExterno, topico, conexaoId: conexao?.id, payload: aviso })
    .onConflictDoNothing();
  if (conexao && (TOPICOS_PEDIDO.magalu as readonly string[]).includes(topico)) {
    after(() => processarAvisosDePedido(conexao.id, "magalu"));
  }
  return new Response(null, { status: 200 });
}
