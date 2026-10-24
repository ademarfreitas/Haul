// Modelo de dados do Haul (MVP: Mercado Livre e Shopee; os outros canais já cabem no enum).
// Convenções: valores em centavos (integer), datas com fuso, toda tabela de lojista tem conta_id.
// Nomes em TypeScript são camelCase; no banco viram snake_case (casing no drizzle.config.ts).
import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid().primaryKey().defaultRandom();
const criadoEm = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const centavos = () => integer();

// ---------- enums ----------

export const canal = pgEnum("canal", [
  "mercado_livre",
  "shopee",
  "shein",
  "amazon",
  "magalu",
  "facebook",
  "venda_direta",
]);

export const tipoPessoa = pgEnum("tipo_pessoa", ["pf", "pj"]);

// teste (30 dias) → ativa; sem pagamento em 5 dias → somente_leitura.
export const situacaoAssinatura = pgEnum("situacao_assinatura", [
  "teste",
  "ativa",
  "pagamento_pendente",
  "somente_leitura",
  "cancelada",
]);

export const plano = pgEnum("plano", ["essencial", "profissional", "avancado"]);

export const situacaoConexao = pgEnum("situacao_conexao", [
  "ativa",
  "expirada", // token venceu e o refresh falhou: vira tarefa "reconectar canal"
  "revogada",
]);

export const condicaoPeca = pgEnum("condicao_peca", [
  "nova_com_etiqueta",
  "nova_sem_etiqueta",
  "seminova",
  "usada_bom_estado",
  "usada_com_detalhes",
]);

export const situacaoPeca = pgEnum("situacao_peca", [
  "rascunho",
  "disponivel",
  "reservada", // vendeu num canal, tirando dos outros
  "vendida",
  "arquivada",
]);

export const situacaoAnuncio = pgEnum("situacao_anuncio", [
  "rascunho",
  "publicando",
  "ativo",
  "pausado",
  "removendo",
  "removido",
  "vendido",
  "erro",
]);

export const situacaoPedido = pgEnum("situacao_pedido", [
  "aguardando_pagamento",
  "pago",
  "pronto_para_envio",
  "enviado",
  "entregue",
  "cancelado",
  "devolvido",
]);

// marketplace = etiqueta oficial do canal; propria = venda direta, Facebook, envio próprio Amazon.
export const logistica = pgEnum("logistica", ["marketplace", "propria"]);

export const documentoFiscal = pgEnum("documento_fiscal", ["nfe", "declaracao_conteudo"]);

export const situacaoRepasse = pgEnum("situacao_repasse", ["previsto", "liberado", "estornado"]);

export const tipoTarefa = pgEnum("tipo_tarefa", [
  "imprimir_etiqueta",
  "despachar",
  "emitir_documento_fiscal",
  "conferir_taxa", // taxa real ou confirmada diferente da estimada
  "remover_anuncio_falhou",
  "reconectar_canal",
  "responder_comprador",
  "outra",
]);

// de onde veio o cliente (CRM); o comprador de marketplace vem do próprio canal
export const origemCliente = pgEnum("origem_cliente", [
  "marketplace",
  "indicacao",
  "instagram",
  "facebook",
  "google",
  "whatsapp",
  "loja_fisica",
  "site",
  "evento",
  "outro",
]);

// funil de vendas do CRM
export const etapaOportunidade = pgEnum("etapa_oportunidade", ["contato", "qualificado", "proposta", "negociacao", "ganho", "perdido"]);
export const motivoPerda = pgEnum("motivo_perda", ["preco", "prazo", "concorrente", "desistiu", "sem_resposta", "outro"]);
// oferta só vai para quem aceitou (LGPD); relacionamento (pós-venda, aniversário) para todo cliente próprio com WhatsApp
export const tipoCampanha = pgEnum("tipo_campanha", ["oferta", "relacionamento"]);

export const situacaoTarefa = pgEnum("situacao_tarefa", ["aberta", "concluida", "ignorada"]);

// ---------- conta, usuários, assinatura ----------

export const contas = pgTable("contas", {
  id: id(),
  nome: text().notNull(),
  // primeiros passos (preenchidos uma vez depois do cadastro)
  tipoPessoa: tipoPessoa(),
  documento: text(), // CPF ou CNPJ, só dígitos
  celular: text(), // E.164
  primeirosPassosEm: timestamp({ withTimezone: true }),
  // assinatura
  plano: plano(),
  situacaoAssinatura: situacaoAssinatura().notNull().default("teste"),
  testeAte: timestamp({ withTimezone: true })
    .notNull()
    .default(sql`now() + interval '30 days'`),
  pagoAte: timestamp({ withTimezone: true }),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

export const usuarios = pgTable(
  "usuarios",
  {
    id: id(),
    contaId: uuid()
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    nome: text().notNull(),
    email: text().notNull(),
    senhaHash: text(), // scrypt (lib/senha.ts); nulo se entrar só por link/OAuth
    emailVerificadoEm: timestamp({ withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("usuarios_email_unico").on(sql`lower(${t.email})`)],
);

// 30 dias de plano para quem indica quando o indicado paga a primeira mensalidade.
export const indicacoes = pgTable(
  "indicacoes",
  {
    id: id(),
    indicadoraId: uuid()
      .notNull()
      .references(() => contas.id),
    indicadaId: uuid()
      .notNull()
      .references(() => contas.id),
    recompensaConcedidaEm: timestamp({ withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex().on(t.indicadaId)],
);

// ---------- canais conectados (OAuth dos marketplaces) ----------

export const conexoesCanal = pgTable(
  "conexoes_canal",
  {
    id: id(),
    contaId: uuid()
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    canal: canal().notNull(),
    usuarioExterno: text().notNull(), // seller id no ML, shop_id na Shopee
    apelido: text(),
    // tokens cifrados na aplicação (AES-256-GCM com CHAVE_TOKENS); nunca em texto puro
    accessTokenCifrado: text(),
    refreshTokenCifrado: text(),
    tokenExpiraEm: timestamp({ withTimezone: true }),
    situacao: situacaoConexao().notNull().default("ativa"),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [uniqueIndex().on(t.canal, t.usuarioExterno), index().on(t.contaId)],
);

// ---------- inventário ----------

export const pecas = pgTable(
  "pecas",
  {
    id: id(),
    contaId: uuid()
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    sku: text().notNull(),
    titulo: text().notNull(),
    descricao: text(),
    marca: text(),
    categoria: text(),
    tamanho: text(),
    cor: text(),
    condicao: condicaoPeca(),
    precoCentavos: centavos().notNull(),
    custoCentavos: centavos(),
    quantidade: integer().notNull().default(1), // brechó: quase sempre 1
    pesoGramas: integer(),
    alturaCm: integer(),
    larguraCm: integer(),
    comprimentoCm: integer(),
    atributos: jsonb().$type<Record<string, string>>(), // ficha técnica pedida por cada canal
    situacao: situacaoPeca().notNull().default("rascunho"),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [uniqueIndex().on(t.contaId, t.sku), index().on(t.contaId, t.situacao)],
);

export const fotosPeca = pgTable(
  "fotos_peca",
  {
    id: id(),
    pecaId: uuid()
      .notNull()
      .references(() => pecas.id, { onDelete: "cascade" }),
    url: text().notNull(),
    ordem: integer().notNull().default(0),
    criadoEm: criadoEm(),
  },
  (t) => [index().on(t.pecaId, t.ordem)],
);

// Um anúncio por peça e canal. Taxa no 1º momento: estimada pela tabela ao anunciar.
export const anuncios = pgTable(
  "anuncios",
  {
    id: id(),
    contaId: uuid()
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    pecaId: uuid()
      .notNull()
      .references(() => pecas.id, { onDelete: "cascade" }),
    conexaoId: uuid().references(() => conexoesCanal.id), // nulo na venda direta
    canal: canal().notNull(),
    idExterno: text(), // MLB..., item_id da Shopee
    url: text(),
    titulo: text(), // pode diferir do título da peça (limite de cada canal)
    precoCentavos: centavos().notNull(),
    taxaEstimadaCentavos: centavos(),
    freteEstimadoCentavos: centavos(),
    situacao: situacaoAnuncio().notNull().default("rascunho"),
    ultimoErro: text(),
    publicadoEm: timestamp({ withTimezone: true }),
    removidoEm: timestamp({ withTimezone: true }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex().on(t.pecaId, t.canal),
    uniqueIndex().on(t.canal, t.idExterno),
    index().on(t.contaId, t.situacao),
  ],
);

// ---------- vendas ----------

// Taxa nos três momentos: estimada (copiada do anúncio), real (informada pelo canal no pedido)
// e confirmada (no repasse). Diferenças geram tarefa "conferir_taxa".
export const pedidos = pgTable(
  "pedidos",
  {
    id: id(),
    contaId: uuid()
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    canal: canal().notNull(),
    conexaoId: uuid().references(() => conexoesCanal.id),
    idExterno: text(), // nulo na venda direta
    anuncioId: uuid().references(() => anuncios.id),
    pecaId: uuid().references(() => pecas.id),
    situacao: situacaoPedido().notNull().default("pago"),
    compradorNome: text(),
    clienteId: uuid().references(() => clientes.id, { onDelete: "set null" }),
    cep: char({ length: 8 }),
    uf: char({ length: 2 }),
    cidade: text(),
    valorVendaCentavos: centavos().notNull(),
    freteCobradoCentavos: centavos(),
    taxaEstimadaCentavos: centavos(),
    taxaRealCentavos: centavos(),
    taxaConfirmadaCentavos: centavos(),
    logistica: logistica().notNull().default("marketplace"),
    etiquetaUrl: text(), // etiqueta oficial do canal ou a nossa
    codigoRastreio: text(),
    documentoFiscal: documentoFiscal(),
    chaveNfe: char({ length: 44 }),
    dadosBrutos: jsonb(), // resposta do canal, para auditoria
    vendidoEm: timestamp({ withTimezone: true }).notNull(),
    enviadoEm: timestamp({ withTimezone: true }),
    entregueEm: timestamp({ withTimezone: true }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex().on(t.canal, t.idExterno),
    index().on(t.contaId, t.situacao),
    index().on(t.contaId, t.vendidoEm),
    index().on(t.clienteId),
  ],
);

export const repasses = pgTable(
  "repasses",
  {
    id: id(),
    contaId: uuid()
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    canal: canal().notNull(),
    conexaoId: uuid().references(() => conexoesCanal.id),
    idExterno: text(),
    valorLiquidoCentavos: centavos().notNull(),
    previstoPara: timestamp({ withTimezone: true }),
    liberadoEm: timestamp({ withTimezone: true }),
    situacao: situacaoRepasse().notNull().default("previsto"),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [uniqueIndex().on(t.canal, t.idExterno), index().on(t.contaId, t.previstoPara)],
);

export const repassePedidos = pgTable(
  "repasse_pedidos",
  {
    id: id(),
    repasseId: uuid()
      .notNull()
      .references(() => repasses.id, { onDelete: "cascade" }),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidos.id),
    valorLiquidoCentavos: centavos().notNull(),
    taxaConfirmadaCentavos: centavos(),
  },
  (t) => [uniqueIndex().on(t.repasseId, t.pedidoId), index().on(t.pedidoId)],
);

// ---------- CRM (plano Avançado; ver docs/crm.md) ----------

// Um cliente por conta. O comprador de marketplace entra sozinho pelos pedidos (canal + apelido no canal)
// e só serve para análise: o canal não passa o contato e não deixa usar o dado para marketing.
// Cliente próprio (venda direta, Facebook, cadastro à mão) pode ter WhatsApp, e-mail e aceite de ofertas (LGPD).
// O que o CRM calcula (ritmo, segmento, o que compra) sai dos pedidos na hora; aqui fica só o que é do lojista.
export const clientes = pgTable(
  "clientes",
  {
    id: id(),
    contaId: uuid()
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    canal: canal(), // canal do comprador de marketplace; nulo no cliente cadastrado à mão
    chaveCanal: text(), // apelido do comprador no canal, em minúsculas (ML e Shopee: o apelido é único)
    nome: text().notNull(),
    whatsapp: text(), // só dígitos, com DDI (55...)
    email: text(),
    aniversario: date(),
    origem: origemCliente(),
    cidade: text(),
    uf: char({ length: 2 }),
    ofertasAceiteEm: timestamp({ withTimezone: true }),
    ofertasOrigem: text(), // como o aceite foi dado ("pediu no balcão", "formulário"...)
    proximoContato: date(),
    proximoPasso: text(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex().on(t.contaId, t.canal, t.chaveCanal),
    index().on(t.contaId, t.proximoContato),
  ],
);

// interesses marcados à mão (os automáticos vêm das categorias que o cliente compra e não são gravados)
export const clienteEtiquetas = pgTable(
  "cliente_etiquetas",
  {
    clienteId: uuid()
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    contaId: uuid()
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    etiqueta: text().notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [primaryKey({ columns: [t.clienteId, t.etiqueta] }), index().on(t.contaId, t.etiqueta)],
);

export const clienteNotas = pgTable(
  "cliente_notas",
  {
    id: id(),
    contaId: uuid()
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    clienteId: uuid()
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    texto: text().notNull(),
    usuarioId: uuid().references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
  },
  (t) => [index().on(t.clienteId, t.criadoEm)],
);

// Funil: a oportunidade pode ser de um cliente ou de um contato solto (lead), que vira cliente próprio ao ganhar.
export const oportunidades = pgTable(
  "oportunidades",
  {
    id: id(),
    contaId: uuid()
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    numero: integer().notNull(),
    clienteId: uuid().references(() => clientes.id, { onDelete: "cascade" }),
    contatoNome: text(),
    contatoWhatsapp: text(), // só dígitos, com 55
    titulo: text().notNull(),
    valorCentavos: centavos().notNull().default(0),
    etapa: etapaOportunidade().notNull().default("contato"),
    origem: origemCliente(),
    proximaAcao: text(),
    proximaData: date(),
    motivoPerda: motivoPerda(),
    motivoTexto: text(),
    criadoPor: uuid().references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    etapaDesde: timestamp({ withTimezone: true }).notNull().defaultNow(),
    fechadoEm: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex().on(t.contaId, t.numero), index().on(t.contaId, t.etapa), index().on(t.clienteId)],
);

export const oportunidadeEventos = pgTable(
  "oportunidade_eventos",
  {
    id: id(),
    contaId: uuid()
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    oportunidadeId: uuid()
      .notNull()
      .references(() => oportunidades.id, { onDelete: "cascade" }),
    de: etapaOportunidade(),
    para: etapaOportunidade().notNull(),
    texto: text(),
    usuarioId: uuid().references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
  },
  (t) => [index().on(t.oportunidadeId, t.criadoEm)],
);

// Campanha: uma mensagem para um grupo de clientes próprios, mandada um a um pelo WhatsApp do lojista.
export const campanhas = pgTable(
  "campanhas",
  {
    id: id(),
    contaId: uuid()
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    numero: integer().notNull(),
    nome: text().notNull(),
    filtro: jsonb().$type<Record<string, string | boolean>>().notNull().default({}),
    mensagem: text().notNull(),
    tipo: tipoCampanha().notNull().default("oferta"),
    criadoPor: uuid().references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex().on(t.contaId, t.numero)],
);

export const campanhaEnvios = pgTable(
  "campanha_envios",
  {
    campanhaId: uuid()
      .notNull()
      .references(() => campanhas.id, { onDelete: "cascade" }),
    clienteId: uuid()
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    enviadoEm: criadoEm(),
  },
  (t) => [primaryKey({ columns: [t.campanhaId, t.clienteId] })],
);

// ---------- tarefas ----------

export const tarefas = pgTable(
  "tarefas",
  {
    id: id(),
    contaId: uuid()
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    tipo: tipoTarefa().notNull(),
    situacao: situacaoTarefa().notNull().default("aberta"),
    titulo: text().notNull(),
    detalhe: text(),
    pedidoId: uuid().references(() => pedidos.id, { onDelete: "cascade" }),
    pecaId: uuid().references(() => pecas.id, { onDelete: "cascade" }),
    anuncioId: uuid().references(() => anuncios.id, { onDelete: "cascade" }),
    conexaoId: uuid().references(() => conexoesCanal.id, { onDelete: "cascade" }),
    prazo: timestamp({ withTimezone: true }),
    concluidaEm: timestamp({ withTimezone: true }),
    criadoEm: criadoEm(),
  },
  (t) => [index().on(t.contaId, t.situacao, t.prazo)],
);

// ---------- integração ----------

// Notificações recebidas dos canais (webhooks). Guardadas antes de processar, sem duplicar.
export const eventosCanal = pgTable(
  "eventos_canal",
  {
    id: id(),
    canal: canal().notNull(),
    idExterno: text().notNull(), // id da notificação no canal
    topico: text().notNull(), // ex.: orders_v2, items (ML)
    conexaoId: uuid().references(() => conexoesCanal.id, { onDelete: "set null" }),
    payload: jsonb().notNull(),
    processadoEm: timestamp({ withTimezone: true }),
    tentativas: integer().notNull().default(0),
    ultimoErro: text(),
    recebidoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex().on(t.canal, t.idExterno),
    index("eventos_canal_pendentes_idx").on(t.recebidoEm).where(sql`${t.processadoEm} is null`),
  ],
);

// Tabela de taxas por canal e categoria, usada na estimativa do anúncio.
export const tabelaTaxas = pgTable(
  "tabela_taxas",
  {
    id: id(),
    canal: canal().notNull(),
    categoria: text(), // nulo = padrão do canal
    percentualBasico: integer().notNull(), // em centésimos de ponto: 1400 = 14,00%
    taxaFixaCentavos: centavos().notNull().default(0),
    regras: jsonb(), // faixas de preço, frete grátis etc.
    fonte: text().notNull(), // de onde veio o número
    oficial: boolean().notNull().default(false),
    vigenteDesde: timestamp({ withTimezone: true }).notNull().defaultNow(),
    vigenteAte: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.canal, t.categoria)],
);
