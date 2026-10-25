# IA nos anúncios, importação do fornecedor e avisos

Decidido com o usuário em 25/10/2026, a partir das ideias do Zeedrop. Proposta completa: Claude Doc
"Plist: fornecedores, IA e monitoramento". Dropshipping internacional (AliExpress, CJ) ficou **fora do lançamento**;
raspar Amazon/Walmart foi descartado (termos de uso da Amazon proíbem; Walmart não opera no Brasil).

## 1. Preencher com IA

- Onde: Novo anúncio do Mercado Livre e da Shopee (`app/(sistema)/_partes/preencher-ia.tsx`).
- O que faz: o navegador reduz até 4 fotos para 768 px e manda com o que o lojista escreveu para
  `/api/ia/anuncio`; o Claude devolve título para o ML (60) e para a Shopee (120), descrição, marca, cor, tamanho,
  estado e o que não deu para saber. Título e descrição são trocados; o resto só preenche campo vazio.
- Modelo: **Claude Haiku 5.5** (o mais barato), esforço baixo, resposta de no máximo 1.500 tokens.
- Custo (`lib/ia-limites.ts`, testado em `testes/ia.test.mjs`): uns R$ 0,005 por anúncio típico e no máximo
  R$ 0,008 (dólar a R$ 6). O usuário pediu **no máximo R$ 2 a cada 50 anúncios**: o pior caso dá uns R$ 0,41.
- Limite: 5/15/50 por mês (Essencial/Profissional/Avançado), 50 no teste grátis. Cada uso fica em `usos_ia`,
  e há um segundo freio: gasto do mês ≤ limite × R$ 0,04. O custo real do mês aparece em Assinantes.
- Ligar: criar a chave em console.anthropic.com, pôr `ANTHROPIC_API_KEY` na Vercel e um limite de gasto lá.

## 2. Importar do fornecedor (Estoque > Importar do fornecedor)

- **XML da NF-e de compra**: nome, código, EAN, quantidade e custo unitário (`vUnCom`, sem rateio de IPI/ST/frete).
  A chave da nota fica em `importacoes`: a mesma nota não soma duas vezes.
- **Planilha CSV** (Excel: Salvar como > CSV): o Plist adivinha as colunas pelo cabeçalho e lembra por fornecedor.
  `.xlsx` não é lido direto.
- Produto que já existe (mesmo código no fornecedor ou mesmo EAN) soma a quantidade, atualiza o custo e leva a
  quantidade nova aos anúncios no ar; produto novo entra como **rascunho** com custo, pronto para anunciar.
- Rascunho se anuncia primeiro no ML (`/novo-anuncio?peca=<id>`), onde as fotos sobem; depois os outros canais
  usam as fotos dela.
- **Catálogo do ML pelo código de barras**: botão "Buscar no catálogo do ML" ao lado do EAN no Novo anúncio
  (`produtoPorGtin` em `lib/ml-anuncio.ts`): título, marca e cor. Não testado contra a API real ainda.

## 3. Avisos (sem SMS)

- **Custo subiu** (nota ou planilha nova): tarefa "Custo" em Tarefas com quanto sobra em cada canal e o preço que
  mantém a sobra de antes (`lib/avisos.ts`, textos em `lib/avisos-texto.ts`).
- **Estoque baixo**: só para produtos com mínimo (definido ao importar). Confere depois de cada venda, ao importar
  e ao abrir Tarefas; fecha sozinho quando chega mercadoria.
- E-mail pelo Resend para os usuários da conta; a tela Avisos liga e desliga cada tipo (`contas.avisos_email`).

## Banco

Migração `0005_fornecedores_ia`: tabelas `fornecedores`, `importacoes`, `usos_ia`; em `pecas`: `ean`,
`fornecedor_id`, `codigo_fornecedor`, `estoque_minimo`; em `contas`: `avisos_email`; tipos de tarefa
`conferir_custo` e `repor_estoque`. Rodar `npm run db:migrar` antes de publicar.

## Depois (só se os lojistas pedirem)

Bling/Tiny e CJ/AliExpress por API, com o cron diário conferindo preço e estoque do fornecedor e regras de pausar
anúncio e ajustar preço.
