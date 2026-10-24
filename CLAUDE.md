# Plist — instruções para o Claude

Toda sessão nesta pasta trabalha **só no Plist**. Fale com o usuário em **português do Brasil**.

## O que é

**Plist**: canal de listagem e multivenda para lojistas de **todos os nichos** no Brasil (não só brechós;
definido em 22/10/2026). Um cadastro publica o produto em vários
marketplaces; quando vende num, o Plist tira o anúncio dos outros, deixa a etiqueta pronta e mostra
o que falta fazer até o dinheiro ser liberado.

## Regras que não se quebram

1. **Projeto totalmente separado do Zappy Core** (`C:\app\Pessoal`, GitHub `ademarfreitas/ZappyCore`).
   Não ler, não alterar e não usar código, banco, projeto Google, conta Asaas, número de WhatsApp
   ou qualquer conta do Zappy Core. Se algo de lá servir de referência, perguntar antes de copiar;
   nunca criar dependência compartilhada.
2. **Minha Lida** (`C:\app\agroflux`) também não se toca.
3. **Segredos** só em `.env.local` (fora do Git) ou no gerenciador de segredos da nuvem. Nunca em
   código, commit, log, resposta ou URL.
4. **Publicar, fazer push ou mexer em conta externa só com o OK explícito do usuário.**
5. **Dados de teste nunca em produção**; não mandar WhatsApp/SMS real para número real em teste.
6. **Edição de código com crase, `$` ou `\`: sempre pela ferramenta de edição** (Edit/Write). Em
   script, trocar texto com `s.split(a).join(b)`, nunca `String.replace` com `$` no texto de troca.
   Depois de gerar, conferir com `node --check`.

## Situação atual (21/10/2026)

- Só existe o **protótipo de tela**: `plist-prototipo.html` (sem servidor, sem banco; integrações,
  pagamentos, impressão e taxa real são simulados). Versão publicada, privada:
  https://claude.ai/artifact/7SU5tHQxUKgTYefe4hrn3A (título "E-Commerce Listing").
- O arquivo é um trecho de página para o visualizador de artefatos (sem `<html>`/`<head>`).
- **Site público na Vercel:** `node scripts/montar-site.mjs` gera `public/site.html` a partir do protótipo;
  `next.config.ts` abre esse site na raiz de todo endereço, menos em app.plist.com.br (raiz = sistema).
  O sistema começa em /inventario. Em plist.com.br/www só a raiz é o site; o resto redireciona para
  app.plist.com.br (`APP_URL`), passo a passo do domínio em `docs/dominio.md`. Depois de mudar o protótipo, rodar o script de novo e copiar para haul-site.
- **Cadastro e login reais** no app (22/10/2026): /cadastro → /primeiros-passos (uma vez) → /inventario; /entrar e Sair.
  O site em "/" leva Entrar e Começar grátis para essas telas (script injetado por montar-site.mjs).
- **Sistema real** (`app/(sistema)/`, 22/10/2026): menu igual ao do protótipo; Inventário traz os anúncios do
  Mercado Livre (`lib/ml-importar.ts`), Estoque lista as peças, Novo anúncio publica no ML (`lib/ml-anuncio.ts`;
  fotos guardadas no próprio ML), Pedidos e Tarefas trazem as vendas do ML (`lib/ml-pedidos.ts`: etiqueta
  oficial em PDF, taxa real × estimada, baixa de estoque), Resultados (Command Center com os números reais),
  Minha conta (dados, plano escolhido, senha, link de indicação `/cadastro?ind=<conta>`), Canais conecta.
  CRM (`app/(sistema)/crm`, `lib/crm*.ts`, `docs/crm.md`, 24/10/2026): só no Avançado (e no teste); abas Hoje, Clientes,
  Funil e Campanhas; clientes saem dos pedidos; contato direto (WhatsApp, campanhas) só com cliente próprio, nunca com
  comprador de marketplace. Testes: `npm run testar`.
  Avisos segue "em construção" (depende do WhatsApp Business); cobrança e comparação de preços também. A cara vem do protótipo: `node scripts/montar-estilo-sistema.mjs` gera
  `app/(sistema)/sistema.css` a partir do `<style>` dele.
  Por cima vem `app/(sistema)/tema.css` (escrito à mão, 24/10/2026): menu escuro com ícones e grupos, barra no topo,
  cartões e tabelas novos. Entrar/cadastro/primeiros passos em duas colunas (`app/_acesso/moldura.tsx`, `app/estilo.css`).
- Ainda não há repositório no GitHub, nuvem, banco, domínio nem CNPJ do Plist.

## Decisões já tomadas (não repropor sem o usuário pedir)

- **Nome:** o produto e o projeto se chamam **Plist** (antes "Haul"), site **plist.com.br** (22/10/2026).
  Logo em `marca/`: o P de Plist com três pontos saindo dele (o mesmo anúncio indo para vários canais);
  azul #4C6BFF → #2B47D0 (o mesmo azul do site), tinta #14111F, branco; wordmark Inter ExtraBold minúsculo.

- **Canais:** Mercado Livre, Shopee, Shein, Amazon, Magalu, Facebook Marketplace e venda direta.
  **Temu e TikTok Shop foram removidos** (21/10/2026).
- **Mercado brasileiro**, interface em português, valores em R$, CEP/UF, NF-e ou declaração de conteúdo.
- **Etiqueta:** quando a logística é do marketplace, a etiqueta é a oficial dele (o código de barras é
  o que a coleta lê); etiqueta própria só na venda direta, no Facebook e no envio próprio da Amazon.
- **Taxas em três momentos:** estimada pela tabela no anúncio, real informada no pedido, confirmada
  no repasse. Diferenças aparecem em Pedidos, Tarefas, Command Center e Canais.
- **Cadastro na primeira entrada** (nome, e-mail, senha) → primeiros passos uma vez (PF ou PJ,
  documento, celular) → sistema. Os primeiros passos não ficam no menu.
- **30 dias grátis sem cartão**; depois cobra o plano; sem pagamento em 5 dias a conta fica só leitura.
  Indicação: 30 dias de plano para quem indica, quando o indicado paga a primeira mensalidade.
- **Planos** (24/10/2026, `lib/planos.ts`): Essencial R$ 19,90 (2 canais, 50 anúncios, 1 usuário, 5 IA/mês);
  Profissional R$ 49,90 (todos os canais, 100 anúncios, 3 usuários, 15 IA/mês);
  Avançado R$ 79,90 (todos os canais, 500 anúncios, 5 usuários, 50 IA/mês, módulo CRM em breve).
  Todos com SMS a cada venda.
- **Site público** com Planos e Entrar no canto superior direito; fonte **Inter**.

## Em aberto (decidir com o usuário)

- Limites dos planos ainda não são cobrados pelo sistema (canais, anúncios, usuários, IA, SMS).
- Facebook Marketplace: sem API oficial; automatizar por extensão pode violar as regras da Meta.
  Lançar sem ele ou só com publicação assistida?
- Marca **Plist**: busca no INPI e registro de plist.com.br ainda por fazer; CNPJ próprio.
- Taxas de cada canal vieram de fontes não oficiais (out/2026): conferir nas centrais antes de usar.
- Quem gera a etiqueta e o formato no Magalu e na Shein; prazo real de repasse de cada canal.

## Próximos passos combinados

1. Validar com 15 a 20 brechós (protótipo + lista de espera).
2. Decisões de negócio (acima).
3. MVP com **Mercado Livre e Shopee**: conta/login, inventário sincronizado, anúncio em vários canais
   com IA, tirar dos outros canais ao vender, etiqueta oficial, Tarefas, avisos no WhatsApp,
   teste de 30 dias e cobrança.
4. Em paralelo: aprovações (app no DevCenter do ML, parceiro na Shopee Open Platform, WhatsApp
   Business), termos de uso, privacidade/LGPD, certificado de assinatura do Plist Agente.
5. Beta fechado com 10 a 20 lojistas → lançamento.
