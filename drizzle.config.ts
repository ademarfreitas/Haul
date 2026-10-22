import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// A connection string fica só no .env.local (fora do Git). Ver .env.example.
config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  // migrations pela conexão direta (sem pooler) quando houver
  dbCredentials: { url: process.env.DATABASE_URL_DIRETA || process.env.DATABASE_URL || "" },
  casing: "snake_case",
  strict: true,
  verbose: true,
});
