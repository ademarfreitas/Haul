import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function criar() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida (ver .env.example)");
  return drizzle(neon(url), { schema, casing: "snake_case" });
}

let instancia: ReturnType<typeof criar> | undefined;

// Conecta só no primeiro uso: o build do Next importa os módulos sem ter o .env.local.
export function obterDb() {
  return (instancia ??= criar());
}
