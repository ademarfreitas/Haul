import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida (ver .env.example)");

export const db = drizzle(neon(url), { schema, casing: "snake_case" });
