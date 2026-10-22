CREATE TYPE "public"."canal" AS ENUM('mercado_livre', 'shopee', 'shein', 'amazon', 'magalu', 'facebook', 'venda_direta');--> statement-breakpoint
CREATE TYPE "public"."condicao_peca" AS ENUM('nova_com_etiqueta', 'nova_sem_etiqueta', 'seminova', 'usada_bom_estado', 'usada_com_detalhes');--> statement-breakpoint
CREATE TYPE "public"."documento_fiscal" AS ENUM('nfe', 'declaracao_conteudo');--> statement-breakpoint
CREATE TYPE "public"."logistica" AS ENUM('marketplace', 'propria');--> statement-breakpoint
CREATE TYPE "public"."plano" AS ENUM('essencial', 'profissional', 'avancado');--> statement-breakpoint
CREATE TYPE "public"."situacao_anuncio" AS ENUM('rascunho', 'publicando', 'ativo', 'pausado', 'removendo', 'removido', 'vendido', 'erro');--> statement-breakpoint
CREATE TYPE "public"."situacao_assinatura" AS ENUM('teste', 'ativa', 'pagamento_pendente', 'somente_leitura', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."situacao_conexao" AS ENUM('ativa', 'expirada', 'revogada');--> statement-breakpoint
CREATE TYPE "public"."situacao_peca" AS ENUM('rascunho', 'disponivel', 'reservada', 'vendida', 'arquivada');--> statement-breakpoint
CREATE TYPE "public"."situacao_pedido" AS ENUM('aguardando_pagamento', 'pago', 'pronto_para_envio', 'enviado', 'entregue', 'cancelado', 'devolvido');--> statement-breakpoint
CREATE TYPE "public"."situacao_repasse" AS ENUM('previsto', 'liberado', 'estornado');--> statement-breakpoint
CREATE TYPE "public"."situacao_tarefa" AS ENUM('aberta', 'concluida', 'ignorada');--> statement-breakpoint
CREATE TYPE "public"."tipo_pessoa" AS ENUM('pf', 'pj');--> statement-breakpoint
CREATE TYPE "public"."tipo_tarefa" AS ENUM('imprimir_etiqueta', 'despachar', 'emitir_documento_fiscal', 'conferir_taxa', 'remover_anuncio_falhou', 'reconectar_canal', 'responder_comprador', 'outra');--> statement-breakpoint
CREATE TABLE "anuncios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"peca_id" uuid NOT NULL,
	"conexao_id" uuid,
	"canal" "canal" NOT NULL,
	"id_externo" text,
	"url" text,
	"titulo" text,
	"preco_centavos" integer NOT NULL,
	"taxa_estimada_centavos" integer,
	"frete_estimado_centavos" integer,
	"situacao" "situacao_anuncio" DEFAULT 'rascunho' NOT NULL,
	"ultimo_erro" text,
	"publicado_em" timestamp with time zone,
	"removido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conexoes_canal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"canal" "canal" NOT NULL,
	"usuario_externo" text NOT NULL,
	"apelido" text,
	"access_token_cifrado" text,
	"refresh_token_cifrado" text,
	"token_expira_em" timestamp with time zone,
	"situacao" "situacao_conexao" DEFAULT 'ativa' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo_pessoa" "tipo_pessoa",
	"documento" text,
	"celular" text,
	"primeiros_passos_em" timestamp with time zone,
	"plano" "plano",
	"situacao_assinatura" "situacao_assinatura" DEFAULT 'teste' NOT NULL,
	"teste_ate" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL,
	"pago_ate" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_canal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canal" "canal" NOT NULL,
	"id_externo" text NOT NULL,
	"topico" text NOT NULL,
	"conexao_id" uuid,
	"payload" jsonb NOT NULL,
	"processado_em" timestamp with time zone,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"ultimo_erro" text,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fotos_peca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"peca_id" uuid NOT NULL,
	"url" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indicacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"indicadora_id" uuid NOT NULL,
	"indicada_id" uuid NOT NULL,
	"recompensa_concedida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pecas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"marca" text,
	"categoria" text,
	"tamanho" text,
	"cor" text,
	"condicao" "condicao_peca",
	"preco_centavos" integer NOT NULL,
	"custo_centavos" integer,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"peso_gramas" integer,
	"altura_cm" integer,
	"largura_cm" integer,
	"comprimento_cm" integer,
	"atributos" jsonb,
	"situacao" "situacao_peca" DEFAULT 'rascunho' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"canal" "canal" NOT NULL,
	"conexao_id" uuid,
	"id_externo" text,
	"anuncio_id" uuid,
	"peca_id" uuid,
	"situacao" "situacao_pedido" DEFAULT 'pago' NOT NULL,
	"comprador_nome" text,
	"cep" char(8),
	"uf" char(2),
	"cidade" text,
	"valor_venda_centavos" integer NOT NULL,
	"frete_cobrado_centavos" integer,
	"taxa_estimada_centavos" integer,
	"taxa_real_centavos" integer,
	"taxa_confirmada_centavos" integer,
	"logistica" "logistica" DEFAULT 'marketplace' NOT NULL,
	"etiqueta_url" text,
	"codigo_rastreio" text,
	"documento_fiscal" "documento_fiscal",
	"chave_nfe" char(44),
	"dados_brutos" jsonb,
	"vendido_em" timestamp with time zone NOT NULL,
	"enviado_em" timestamp with time zone,
	"entregue_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repasse_pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repasse_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"valor_liquido_centavos" integer NOT NULL,
	"taxa_confirmada_centavos" integer
);
--> statement-breakpoint
CREATE TABLE "repasses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"canal" "canal" NOT NULL,
	"conexao_id" uuid,
	"id_externo" text,
	"valor_liquido_centavos" integer NOT NULL,
	"previsto_para" timestamp with time zone,
	"liberado_em" timestamp with time zone,
	"situacao" "situacao_repasse" DEFAULT 'previsto' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tabela_taxas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canal" "canal" NOT NULL,
	"categoria" text,
	"percentual_basico" integer NOT NULL,
	"taxa_fixa_centavos" integer DEFAULT 0 NOT NULL,
	"regras" jsonb,
	"fonte" text NOT NULL,
	"oficial" boolean DEFAULT false NOT NULL,
	"vigente_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"vigente_ate" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tarefas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"tipo" "tipo_tarefa" NOT NULL,
	"situacao" "situacao_tarefa" DEFAULT 'aberta' NOT NULL,
	"titulo" text NOT NULL,
	"detalhe" text,
	"pedido_id" uuid,
	"peca_id" uuid,
	"anuncio_id" uuid,
	"conexao_id" uuid,
	"prazo" timestamp with time zone,
	"concluida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conta_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text,
	"email_verificado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anuncios" ADD CONSTRAINT "anuncios_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anuncios" ADD CONSTRAINT "anuncios_peca_id_pecas_id_fk" FOREIGN KEY ("peca_id") REFERENCES "public"."pecas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anuncios" ADD CONSTRAINT "anuncios_conexao_id_conexoes_canal_id_fk" FOREIGN KEY ("conexao_id") REFERENCES "public"."conexoes_canal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conexoes_canal" ADD CONSTRAINT "conexoes_canal_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_canal" ADD CONSTRAINT "eventos_canal_conexao_id_conexoes_canal_id_fk" FOREIGN KEY ("conexao_id") REFERENCES "public"."conexoes_canal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fotos_peca" ADD CONSTRAINT "fotos_peca_peca_id_pecas_id_fk" FOREIGN KEY ("peca_id") REFERENCES "public"."pecas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicacoes" ADD CONSTRAINT "indicacoes_indicadora_id_contas_id_fk" FOREIGN KEY ("indicadora_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicacoes" ADD CONSTRAINT "indicacoes_indicada_id_contas_id_fk" FOREIGN KEY ("indicada_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_conexao_id_conexoes_canal_id_fk" FOREIGN KEY ("conexao_id") REFERENCES "public"."conexoes_canal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_anuncio_id_anuncios_id_fk" FOREIGN KEY ("anuncio_id") REFERENCES "public"."anuncios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_peca_id_pecas_id_fk" FOREIGN KEY ("peca_id") REFERENCES "public"."pecas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasse_pedidos" ADD CONSTRAINT "repasse_pedidos_repasse_id_repasses_id_fk" FOREIGN KEY ("repasse_id") REFERENCES "public"."repasses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasse_pedidos" ADD CONSTRAINT "repasse_pedidos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasses" ADD CONSTRAINT "repasses_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasses" ADD CONSTRAINT "repasses_conexao_id_conexoes_canal_id_fk" FOREIGN KEY ("conexao_id") REFERENCES "public"."conexoes_canal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_peca_id_pecas_id_fk" FOREIGN KEY ("peca_id") REFERENCES "public"."pecas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_anuncio_id_anuncios_id_fk" FOREIGN KEY ("anuncio_id") REFERENCES "public"."anuncios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_conexao_id_conexoes_canal_id_fk" FOREIGN KEY ("conexao_id") REFERENCES "public"."conexoes_canal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anuncios_peca_id_canal_index" ON "anuncios" USING btree ("peca_id","canal");--> statement-breakpoint
CREATE UNIQUE INDEX "anuncios_canal_id_externo_index" ON "anuncios" USING btree ("canal","id_externo");--> statement-breakpoint
CREATE INDEX "anuncios_conta_id_situacao_index" ON "anuncios" USING btree ("conta_id","situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "conexoes_canal_canal_usuario_externo_index" ON "conexoes_canal" USING btree ("canal","usuario_externo");--> statement-breakpoint
CREATE INDEX "conexoes_canal_conta_id_index" ON "conexoes_canal" USING btree ("conta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_canal_canal_id_externo_index" ON "eventos_canal" USING btree ("canal","id_externo");--> statement-breakpoint
CREATE INDEX "eventos_canal_pendentes_idx" ON "eventos_canal" USING btree ("recebido_em") WHERE "eventos_canal"."processado_em" is null;--> statement-breakpoint
CREATE INDEX "fotos_peca_peca_id_ordem_index" ON "fotos_peca" USING btree ("peca_id","ordem");--> statement-breakpoint
CREATE UNIQUE INDEX "indicacoes_indicada_id_index" ON "indicacoes" USING btree ("indicada_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pecas_conta_id_sku_index" ON "pecas" USING btree ("conta_id","sku");--> statement-breakpoint
CREATE INDEX "pecas_conta_id_situacao_index" ON "pecas" USING btree ("conta_id","situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_canal_id_externo_index" ON "pedidos" USING btree ("canal","id_externo");--> statement-breakpoint
CREATE INDEX "pedidos_conta_id_situacao_index" ON "pedidos" USING btree ("conta_id","situacao");--> statement-breakpoint
CREATE INDEX "pedidos_conta_id_vendido_em_index" ON "pedidos" USING btree ("conta_id","vendido_em");--> statement-breakpoint
CREATE UNIQUE INDEX "repasse_pedidos_repasse_id_pedido_id_index" ON "repasse_pedidos" USING btree ("repasse_id","pedido_id");--> statement-breakpoint
CREATE INDEX "repasse_pedidos_pedido_id_index" ON "repasse_pedidos" USING btree ("pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repasses_canal_id_externo_index" ON "repasses" USING btree ("canal","id_externo");--> statement-breakpoint
CREATE INDEX "repasses_conta_id_previsto_para_index" ON "repasses" USING btree ("conta_id","previsto_para");--> statement-breakpoint
CREATE INDEX "tabela_taxas_canal_categoria_index" ON "tabela_taxas" USING btree ("canal","categoria");--> statement-breakpoint
CREATE INDEX "tarefas_conta_id_situacao_prazo_index" ON "tarefas" USING btree ("conta_id","situacao","prazo");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_unico" ON "usuarios" USING btree (lower("email"));