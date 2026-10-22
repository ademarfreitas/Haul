# Plist — protótipo

Canal de listagem e multivenda para lojistas de todos os nichos no Brasil: um cadastro publica no Mercado Livre, Shopee, Shein, Amazon, Magalu e Facebook Marketplace; vendeu num canal, sai dos outros; etiqueta, tarefas pós-venda, taxas (estimada, real e confirmada) e Command Center.

**Projeto separado do Zappy Core.** Não compartilha código, banco, nuvem, Asaas nem WhatsApp com ele.

## O que tem aqui

- `plist-prototipo.html` — protótipo navegável (só tela, com dados de exemplo). Sem servidor, sem banco; integrações, pagamentos e impressão são simulados.
- `marca/` — logo (SVG e PNG): ícone, ícone escuro, favicon, logo horizontal claro e branco, e a prancha de apresentação.
- Versão publicada: https://claude.ai/artifact/7SU5tHQxUKgTYefe4hrn3A (privada; título "E-Commerce Listing").

## Como abrir

O arquivo é um trecho de página (sem `<html>`/`<head>`), feito para o visualizador de artefatos do Claude. Para abrir no navegador, publique de novo como artefato a partir deste arquivo ou envolva o conteúdo num `<!doctype html><html><body>…</body></html>`. Fora do Claude, a IA nos anúncios e o download de PDF ficam desligados (a página mostra um exemplo no lugar).

## Valores que são exemplo

- Preços dos planos (Essencial R$ 49,90, Profissional R$ 99,90, Avançado R$ 179,90) e o que entra em cada um.
- Tabela de taxas de out/2026 tirada de fontes não oficiais: conferir na central de cada marketplace.
- Prazo de repasse (12 dias), compradores, endereços, rastreios e notas fiscais.

## Próximos passos combinados

Validar com brechós → decisões de negócio (nome/INPI, CNPJ, preços, Facebook Marketplace) → MVP com Mercado Livre e Shopee → aprovações nos marketplaces e parte legal → beta fechado → lançamento.

## Banco de dados (Neon Postgres)

TypeScript + Drizzle ORM + driver serverless do Neon. O modelo fica em `db/schema.ts` e as migrations SQL em `db/migrations/`.

1. `npm install`
2. Copiar `.env.example` para `.env.local` e colar a connection string do branch **dev** do Neon (projeto Lister). O `.env.local` não vai para o Git.
3. Mudou o `db/schema.ts`? `npm run db:gerar` cria a migration; revisar o SQL e versionar.
4. `npm run db:migrar` aplica no banco do `DATABASE_URL`. Produção só com migration revisada.

## App (Next.js)

Começou pela conexão com o Mercado Livre: tela `/canais`, rotas em `app/api/canais/mercado-livre/` e a lógica em `lib/` (OAuth, cifra dos tokens, sessão). Passo a passo para criar o app no DevCenter e testar: [docs/mercado-livre.md](docs/mercado-livre.md).

- `npm run dev` sobe em http://localhost:3000 (lê o `.env.local`).
- `npm run build` e `npm run verificar` conferem que compila e que os tipos batem.
- Cadastro e login reais: o site (`/`) leva **Começar 30 dias grátis** para `/cadastro` e **Entrar** para `/entrar`.
  Depois do cadastro vêm os primeiros passos (`/primeiros-passos`: PF ou PJ, CPF/CNPJ, celular), uma vez só,
  e então o sistema (`/canais`). Senha com scrypt (`lib/senha.ts`); sessão num cookie assinado com `SEGREDO_SESSAO`
  (`lib/sessao.ts`); conferência de CPF, CNPJ e celular em `lib/validar.ts`.
- Ainda falta: recuperar senha e confirmar e-mail (precisam do provedor de e-mail), limite de tentativas guardado
  no banco (hoje fica na memória do servidor), termos de uso e política de privacidade.
