CREATE TABLE "captacoes" (
	"conta_id" uuid PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"cupom" text,
	"beneficio" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "captacoes_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
ALTER TABLE "captacoes" ADD CONSTRAINT "captacoes_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;