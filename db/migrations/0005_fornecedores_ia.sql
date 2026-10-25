ALTER TYPE "public"."tipo_tarefa" ADD VALUE 'conferir_custo' BEFORE 'outra';--> statement-breakpoint
ALTER TYPE "public"."tipo_tarefa" ADD VALUE 'repor_estoque' BEFORE 'outra';--> statement-breakpoint
CREATE TABLE "fornecedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"colunas" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "importacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"fornecedor_id" uuid,
	"tipo" text NOT NULL,
	"chave_nfe" char(44),
	"numero" text,
	"itens" integer NOT NULL,
	"criadas" integer NOT NULL,
	"atualizadas" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usos_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"usuario_id" uuid,
	"modelo" text NOT NULL,
	"tokens_entrada" integer NOT NULL,
	"tokens_saida" integer NOT NULL,
	"custo_micro_reais" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "avisos_email" jsonb;--> statement-breakpoint
ALTER TABLE "pecas" ADD COLUMN "ean" text;--> statement-breakpoint
ALTER TABLE "pecas" ADD COLUMN "fornecedor_id" uuid;--> statement-breakpoint
ALTER TABLE "pecas" ADD COLUMN "codigo_fornecedor" text;--> statement-breakpoint
ALTER TABLE "pecas" ADD COLUMN "estoque_minimo" integer;--> statement-breakpoint
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usos_ia" ADD CONSTRAINT "usos_ia_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usos_ia" ADD CONSTRAINT "usos_ia_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fornecedores_conta_id_nome_index" ON "fornecedores" USING btree ("conta_id","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "importacoes_conta_id_chave_nfe_index" ON "importacoes" USING btree ("conta_id","chave_nfe");--> statement-breakpoint
CREATE INDEX "importacoes_conta_id_criado_em_index" ON "importacoes" USING btree ("conta_id","criado_em");--> statement-breakpoint
CREATE INDEX "usos_ia_conta_id_criado_em_index" ON "usos_ia" USING btree ("conta_id","criado_em");--> statement-breakpoint
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pecas_conta_id_ean_index" ON "pecas" USING btree ("conta_id","ean");