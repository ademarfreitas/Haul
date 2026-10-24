CREATE TYPE "public"."origem_cliente" AS ENUM('marketplace', 'indicacao', 'instagram', 'facebook', 'google', 'whatsapp', 'loja_fisica', 'site', 'evento', 'outro');--> statement-breakpoint
CREATE TABLE "cliente_etiquetas" (
	"cliente_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"etiqueta" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cliente_etiquetas_cliente_id_etiqueta_pk" PRIMARY KEY("cliente_id","etiqueta")
);
--> statement-breakpoint
CREATE TABLE "cliente_notas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"usuario_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"canal" "canal",
	"chave_canal" text,
	"nome" text NOT NULL,
	"whatsapp" text,
	"email" text,
	"aniversario" date,
	"origem" "origem_cliente",
	"cidade" text,
	"uf" char(2),
	"ofertas_aceite_em" timestamp with time zone,
	"ofertas_origem" text,
	"proximo_contato" date,
	"proximo_passo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "cliente_id" uuid;--> statement-breakpoint
ALTER TABLE "cliente_etiquetas" ADD CONSTRAINT "cliente_etiquetas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_etiquetas" ADD CONSTRAINT "cliente_etiquetas_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_notas" ADD CONSTRAINT "cliente_notas_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_notas" ADD CONSTRAINT "cliente_notas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_notas" ADD CONSTRAINT "cliente_notas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cliente_etiquetas_conta_id_etiqueta_index" ON "cliente_etiquetas" USING btree ("conta_id","etiqueta");--> statement-breakpoint
CREATE INDEX "cliente_notas_cliente_id_criado_em_index" ON "cliente_notas" USING btree ("cliente_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_conta_id_canal_chave_canal_index" ON "clientes" USING btree ("conta_id","canal","chave_canal");--> statement-breakpoint
CREATE INDEX "clientes_conta_id_proximo_contato_index" ON "clientes" USING btree ("conta_id","proximo_contato");--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedidos_cliente_id_index" ON "pedidos" USING btree ("cliente_id");