// Lista as tabelas do banco do DATABASE_URL, sem mostrar a connection string.
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local", quiet: true });
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida (ver .env.example)");

const sql = neon(url);
const tabelas = await sql`select table_name from information_schema.tables
  where table_schema = 'public' order by table_name`;
const migracoes = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`.catch(() => [{ n: 0 }]);
console.log(`${tabelas.length} tabelas: ${tabelas.map((t) => t.table_name).join(", ")}`);
console.log(`migrations aplicadas: ${migracoes[0].n}`);
