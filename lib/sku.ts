// SKU que o Plist dá à peça cadastrada nele: PL-0001, PL-0002... (por conta).
import { sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";

export async function proximoSku(contaId: string): Promise<string> {
  const r = await obterDb().execute<{ n: number | null }>(
    sql`select max(substring(sku from 4)::int) as n from pecas where conta_id = ${contaId} and sku ~ '^PL-[0-9]{1,9}$'`,
  );
  return `PL-${String((Number(r.rows[0]?.n) || 0) + 1).padStart(4, "0")}`;
}
