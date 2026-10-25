// Renova, uma vez por dia, os tokens de todas as conexões ativas (agenda em vercel.json).
// A Vercel chama com "Authorization: Bearer <CRON_SECRET>"; sem o segredo certo, ninguém roda.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { manterConexoes } from "@/lib/manter-conexoes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const esperado = Buffer.from(`Bearer ${segredo}`);
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await manterConexoes()) });
}
