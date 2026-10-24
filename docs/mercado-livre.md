# Conectar o Mercado Livre — passo a passo

O Plist conecta a conta do lojista pelo OAuth oficial do Mercado Livre (login no próprio ML,
com PKCE). O Plist guarda só os tokens, cifrados com `CHAVE_TOKENS`, na tabela `conexoes_canal`.
A senha do lojista nunca passa pelo Plist.

> Nada deste guia vai para chat, print ou commit: Client Secret, chaves e códigos ficam só no
> `.env.local` do PC e nas variáveis de ambiente da hospedagem.

## 1. Ter um endereço https

O DevCenter exige um Redirect URI em https e fixo, então `http://localhost` não serve para o
callback. Antes de criar o app, defina o endereço público do Plist (hoje `https://app.plist.com.br`, ver docs/dominio.md).
Ele vira o `APP_URL`, e o callback fica em:

```
<APP_URL>/api/canais/mercado-livre/callback
```

### Hospedagem na Vercel (escolhida em 22/10/2026)

O código precisa estar no `main` do GitHub (PRs do banco e do app aprovados e mesclados).

1. Entre em https://vercel.com/signup e escolha **Continue with GitHub** (plano Hobby, grátis, serve
   para teste; para uso comercial, depois, precisa do plano Pro).
2. **Add New → Project** e importe `ademarfreitas/haul`. Se o repositório não aparecer, clique em
   ajustar as permissões do GitHub e libere só esse repositório.
3. Dê ao projeto um nome como `haul-app`. Não precisa mudar nada de build: a Vercel reconhece o Next.js.
4. Em **Environment Variables**, cadastre `DATABASE_URL` (a do branch dev do Neon), `SEGREDO_SESSAO`
   e `CHAVE_TOKENS` (ver passo 3). Clique em **Deploy**.
5. Quando terminar, veja o endereço em **Settings → Domains** (ex.: `https://haul-app.vercel.app`).
   Esse é o `APP_URL`.
6. Em **Settings → Functions → Region**, escolha a região mais perto do banco no Neon (São Paulo,
   `gru1`, se o Neon estiver em São Paulo; senão, a mesma região dos EUA).

Depois do passo 2 abaixo, volte em **Settings → Environment Variables**, cadastre `APP_URL`,
`ML_CLIENT_ID`, `ML_CLIENT_SECRET` e `ML_REDIRECT_URI`, e faça **Redeploy** (aba Deployments).

## 2. Criar o app no DevCenter

1. Entre em https://developers.mercadolivre.com.br/devcenter com a conta do Mercado Livre
   **do Plist** (a sua, de dono do app; não a de um cliente). Se pedir, conclua a validação dos dados.
2. Clique em **Criar uma aplicação** e preencha:
   - **Nome**: Plist. **Nome curto** e **Descrição**: algo como "Multicanal para brechós".
   - **Logo**: opcional por enquanto.
   - **URIs de redirect**: o endereço do passo 1, terminando em `/api/canais/mercado-livre/callback`.
   - **PKCE**: ligado (o Plist já manda `code_challenge` S256).
   - **Escopos**: leitura, escrita e acesso offline (`offline_access`). Sem o offline o ML não manda
     refresh token e a conexão cai em poucas horas.
   - **Permissões/funcionalidades**: Usuários (leitura); Publicação e sincronização (leitura e
     escrita); Vendas e envios (leitura e escrita); Comunicações pós-venda (leitura e escrita).
   - **Notificações** (obrigatório se algum tópico estiver marcado): URL
     `<APP_URL>/api/canais/mercado-livre/notificacoes`. Tópicos: Orders, Items, Shipments,
     Questions/Messages e Post Purchase. A rota guarda cada aviso em `eventos_canal`; o processamento vem depois.
3. Salve. A tela mostra o **ID do aplicativo** (Client ID) e a **Chave secreta** (Client Secret).

## 3. Preencher as variáveis

No `.env.local` (PC) e nas variáveis de ambiente da hospedagem, com os mesmos valores:

| Variável | O que é |
| --- | --- |
| `APP_URL` | endereço do passo 1, sem barra no fim |
| `ML_CLIENT_ID` | ID do aplicativo |
| `ML_CLIENT_SECRET` | Chave secreta |
| `ML_REDIRECT_URI` | `<APP_URL>/api/canais/mercado-livre/callback`, igual ao do DevCenter |
| `SEGREDO_SESSAO` | gerar (comando abaixo) |
| `CHAVE_TOKENS` | gerar (comando abaixo); a mesma no PC e na hospedagem |

Para gerar `SEGREDO_SESSAO` e `CHAVE_TOKENS` (rodar duas vezes, um valor para cada):

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 4. Testar

1. Abra `<APP_URL>/cadastro` (ou o botão **Começar 30 dias grátis** do site), crie sua conta e
   preencha os primeiros passos. Você cai na tela **Canais**. Da próxima vez, use **Entrar**.
2. Clique em **Conectar Mercado Livre**, entre no ML e autorize o Plist.
3. Você volta para Canais com "Mercado Livre conectado" e o apelido da conta.
4. **Testar** chama `/users/me` com o token guardado (renovando se estiver para vencer).

Se der erro, a tela diz o motivo. Os mais comuns: Redirect URI diferente do cadastrado
(`invalid_grant`), Client ID/Secret trocados (`invalid_client`), ou link aberto em outra aba
depois de 10 minutos (`state_invalido`).

## Como funciona por dentro

- `/api/canais/mercado-livre/conectar`: cria `state` e `code_verifier`, guarda num cookie assinado
  de 10 minutos e manda para `auth.mercadolivre.com.br/authorization`.
- `/api/canais/mercado-livre/callback`: confere o `state`, troca o `code` por tokens, lê
  `/users/me` (só aceita conta do Brasil, `MLB`) e grava ou atualiza `conexoes_canal`.
- `lib/mercado-livre.ts` → `tokenValido()`: renova 5 minutos antes de vencer. O refresh token do
  ML é de uso único; se a renovação falhar de vez, a conexão vira `expirada` e nasce a tarefa
  "Reconectar o Mercado Livre".
