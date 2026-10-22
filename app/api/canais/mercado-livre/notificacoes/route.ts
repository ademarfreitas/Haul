// Avisos do ML (pedidos, anúncios, envios, perguntas...). O ML espera 200 rápido e reenvia se não
// receber, então aqui só guardamos em eventos_canal (sem duplicar) e o processamento fica para depois.
// Formato: { _id, resource, user_id, topic, application_id, attempts, sent, received }
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal, eventosCanal } from "@/db/schema";

type Aviso = { _id?: string; resource?: string; user_id?: number; topic?: string; application_id?: number };

export async function POST(req: Request) {
  const aviso = (await req.json().catch(() => null)) as Aviso | null;
  if (!aviso?._id || !aviso.topic) return NextResponse.json({ ok: false }, { status: 400 });
  // aviso de outro app: ignora sem gravar (o endereço é público)
  if (String(aviso.application_id) !== process.env.ML_CLIENT_ID) return NextResponse.json({ ok: true });

  const db = obterDb();
  const [conexao] = await db
    .select({ id: conexoesCanal.id })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.canal, "mercado_livre"), eq(conexoesCanal.usuarioExterno, String(aviso.user_id))));

  await db
    .insert(eventosCanal)
    .values({ canal: "mercado_livre", idExterno: aviso._id, topico: aviso.topic, conexaoId: conexao?.id, payload: aviso })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
