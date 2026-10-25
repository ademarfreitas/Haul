CREATE TYPE "public"."forma_pagamento" AS ENUM('pix', 'boleto', 'cartao', 'manual');--> statement-breakpoint
CREATE TYPE "public"."situacao_cobranca" AS ENUM('pendente', 'paga', 'vencida', 'cancelada', 'estornada');--> statement-breakpoint
CREATE TABLE "cobrancas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"plano" "plano" NOT NULL,
	"valor_centavos" integer NOT NULL,
	"periodo_inicio" timestamp with time zone NOT NULL,
	"periodo_fim" timestamp with time zone NOT NULL,
	"vencimento" timestamp with time zone NOT NULL,
	"situacao" "situacao_cobranca" DEFAULT 'pendente' NOT NULL,
	"forma" "forma_pagamento",
	"paga_em" timestamp with time zone,
	"taxa_provedor_centavos" integer,
	"provedor" text,
	"id_provedor" text,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cobrancas_conta_id_vencimento_index" ON "cobrancas" USING btree ("conta_id","vencimento");--> statement-breakpoint
CREATE INDEX "cobrancas_situacao_vencimento_index" ON "cobrancas" USING btree ("situacao","vencimento");--> statement-breakpoint
CREATE UNIQUE INDEX "cobrancas_provedor_id_provedor_index" ON "cobrancas" USING btree ("provedor","id_provedor");