ALTER TABLE "contas" ADD COLUMN "captacao_codigo" text;--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "captacao_cupom" text;--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "captacao_beneficio" text;--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_captacaoCodigo_unique" UNIQUE("captacao_codigo");