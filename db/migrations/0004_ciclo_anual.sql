CREATE TYPE "public"."ciclo" AS ENUM('mensal', 'anual');--> statement-breakpoint
ALTER TABLE "cobrancas" ADD COLUMN "ciclo" "ciclo" DEFAULT 'mensal' NOT NULL;--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "ciclo" "ciclo" DEFAULT 'mensal' NOT NULL;