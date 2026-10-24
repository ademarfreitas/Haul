CREATE TYPE "public"."etapa_oportunidade" AS ENUM('contato', 'qualificado', 'proposta', 'negociacao', 'ganho', 'perdido');--> statement-breakpoint
CREATE TYPE "public"."motivo_perda" AS ENUM('preco', 'prazo', 'concorrente', 'desistiu', 'sem_resposta', 'outro');--> statement-breakpoint
CREATE TYPE "public"."origem_cliente" AS ENUM('marketplace', 'indicacao', 'instagram', 'facebook', 'google', 'whatsapp', 'loja_fisica', 'site', 'evento', 'outro');--> statement-breakpoint
CREATE TYPE "public"."tipo_campanha" AS ENUM('oferta', 'relacionamento');--> statement-breakpoint
CREATE TABLE "campanha_envios" (
	"campanha_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campanha_envios_campanha_id_cliente_id_pk" PRIMARY KEY("campanha_id","cliente_id")
);
--> statement-breakpoint
CREATE TABLE "campanhas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"nome" text NOT NULL,
	"filtro" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mensagem" text NOT NULL,
	"tipo" "tipo_campanha" DEFAULT 'oferta' NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "oportunidade_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"oportunidade_id" uuid NOT NULL,
	"de" "etapa_oportunidade",
	"para" "etapa_oportunidade" NOT NULL,
	"texto" text,
	"usuario_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oportunidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"cliente_id" uuid,
	"contato_nome" text,
	"contato_whatsapp" text,
	"titulo" text NOT NULL,
	"valor_centavos" integer DEFAULT 0 NOT NULL,
	"etapa" "etapa_oportunidade" DEFAULT 'contato' NOT NULL,
	"origem" "origem_cliente",
	"proxima_acao" text,
	"proxima_data" date,
	"motivo_perda" "motivo_perda",
	"motivo_texto" text,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"etapa_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"fechado_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "cliente_id" uuid;--> statement-breakpoint
ALTER TABLE "campanha_envios" ADD CONSTRAINT "campanha_envios_campanha_id_campanhas_id_fk" FOREIGN KEY ("campanha_id") REFERENCES "public"."campanhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanha_envios" ADD CONSTRAINT "campanha_envios_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_etiquetas" ADD CONSTRAINT "cliente_etiquetas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_etiquetas" ADD CONSTRAINT "cliente_etiquetas_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_notas" ADD CONSTRAINT "cliente_notas_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_notas" ADD CONSTRAINT "cliente_notas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_notas" ADD CONSTRAINT "cliente_notas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_eventos" ADD CONSTRAINT "oportunidade_eventos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_eventos" ADD CONSTRAINT "oportunidade_eventos_oportunidade_id_oportunidades_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_eventos" ADD CONSTRAINT "oportunidade_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campanhas_conta_id_numero_index" ON "campanhas" USING btree ("conta_id","numero");--> statement-breakpoint
CREATE INDEX "cliente_etiquetas_conta_id_etiqueta_index" ON "cliente_etiquetas" USING btree ("conta_id","etiqueta");--> statement-breakpoint
CREATE INDEX "cliente_notas_cliente_id_criado_em_index" ON "cliente_notas" USING btree ("cliente_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_conta_id_canal_chave_canal_index" ON "clientes" USING btree ("conta_id","canal","chave_canal");--> statement-breakpoint
CREATE INDEX "clientes_conta_id_proximo_contato_index" ON "clientes" USING btree ("conta_id","proximo_contato");--> statement-breakpoint
CREATE INDEX "oportunidade_eventos_oportunidade_id_criado_em_index" ON "oportunidade_eventos" USING btree ("oportunidade_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "oportunidades_conta_id_numero_index" ON "oportunidades" USING btree ("conta_id","numero");--> statement-breakpoint
CREATE INDEX "oportunidades_conta_id_etapa_index" ON "oportunidades" USING btree ("conta_id","etapa");--> statement-breakpoint
CREATE INDEX "oportunidades_cliente_id_index" ON "oportunidades" USING btree ("cliente_id");--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedidos_cliente_id_index" ON "pedidos" USING btree ("cliente_id");