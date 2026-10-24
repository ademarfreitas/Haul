// Avisos da Amazon. A SP-API só entrega o aviso de pedido (ORDER_CHANGE) numa fila SQS da AWS; um
// EventBridge Pipe (fila → API destination) repassa cada mensagem para cá (ver docs/amazon.md).
// O endereço é público: só vale aviso com a chave AMAZON_AVISOS_CHAVE no cabeçalho x-plist-chave,
// que é o "API key" da conexão do API destination. Guardamos em eventos_canal (sem duplicar), respondemos,
// e o aviso de pedido dispara, depois da resposta, a busca das vendas daquela conta.
import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal, eventosCanal } from "@/db/schema";
import { processarAvisosDePedido, TOPICOS_PEDIDO } from "@/lib/eventos";

export const maxDuration = 60;

type Aviso = {
  NotificationType?: string;
  Payload?: { OrderChangeNotification?: { SellerId?: string; AmazonOrderId?: string } };
  NotificationMetadata?: { NotificationId?: string };
};

function chaveConfere(recebida: string | null): boolean {
  const esperada = process.env.AMAZON_AVISOS_CHAVE?.trim();
  if (!esperada || !recebida) return false;
  const a = Buffer.from(esperada);
  const b = Buffer.from(recebida);
  return a.length === b.length && timingSafeEqual(a, b);
}

// O Pipe manda o registro do SQS (com a mensagem em "body", texto) ou uma lista deles; aceita também o aviso puro.
function avisosDo(corpo: unknown): Aviso[] {
  const lista = Array.isArray(corpo) ? corpo : [corpo];
  return lista.flatMap((r) => {
    if (r && typeof r === "object" && typeof (r as { body?: unknown }).body === "string") {
      try {
        return [JSON.parse((r as { body: string }).body) as Aviso];
      } catch {
        return [];
      }
    }
    return r && typeof r === "object" ? [r as Aviso] : [];
  });
}

export async function POST(req: Request) {
  if (!chaveConfere(req.headers.get("x-plist-chave"))) return new Response(null, { status: 401 });
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const db = obterDb();
  const buscar = new Set<string>();
  for (const aviso of avisosDo(corpo)) {
    const id = aviso.NotificationMetadata?.NotificationId;
    const topico = aviso.NotificationType;
    if (!id || !topico) continue;
    const vendedor = aviso.Payload?.OrderChangeNotification?.SellerId;
    const [conexao] = vendedor
      ? await db
          .select({ id: conexoesCanal.id })
          .from(conexoesCanal)
          .where(and(eq(conexoesCanal.canal, "amazon"), eq(conexoesCanal.usuarioExterno, vendedor)))
      : [];
    await db.insert(eventosCanal).values({ canal: "amazon", idExterno: id, topico, conexaoId: conexao?.id, payload: aviso }).onConflictDoNothing();
    if (conexao && (TOPICOS_PEDIDO.amazon as readonly string[]).includes(topico)) buscar.add(conexao.id);
  }
  for (const conexaoId of buscar) after(() => processarAvisosDePedido(conexaoId, "amazon"));
  return new Response(null, { status: 200 });
}
