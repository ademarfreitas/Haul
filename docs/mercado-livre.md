# Conectar o Mercado Livre — passo a passo

O Haul conecta a conta do lojista pelo OAuth oficial do Mercado Livre (login no próprio ML,
com PKCE). O Haul guarda só os tokens, cifrados com `CHAVE_TOKENS`, na tabela `conexoes_canal`.
A senha do lojista nunca passa pelo Haul.

> Nada deste guia vai para chat, print ou commit: Client Secret, chaves e códigos ficam só no
> `.env.local` do PC e nas variáveis de ambiente da hospedagem.

## 1. Ter um endereço https

O DevCenter exige um Redirect URI em https e fixo, então `http://localhost` não serve para o
callback. Antes de criar o app, defina o endereço público do Haul (ex.: `https://haul-xxxx.vercel.app`).
Ele vira o `APP_URL`, e o callback fica em:

```
<APP_URL>/api/canais/mercado-livre/callback
```

## 2. Criar o app no DevCenter

1. Entre em https://developers.mercadolivre.com.br/devcenter com a conta do Mercado Livre
   **do Haul** (a sua, de dono do app; não a de um cliente). Se pedir, conclua a validação dos dados.
2. Clique em **Criar uma aplicação** e preencha:
   - **Nome**: Haul. **Nome curto** e **Descrição**: algo como "Multicanal para brechós".
   - **Logo**: opcional por enquanto.
   - **URIs de redirect**: o endereço do passo 1, terminando em `/api/canais/mercado-livre/callback`.
   - **PKCE**: ligado (o Haul já manda `code_challenge` S256).
   - **Escopos**: leitura, escrita e acesso offline (`offline_access`). Sem o offline o ML não manda
     refresh token e a conexão cai em poucas horas.
   - **Permissões/funcionalidades**: Usuários (leitura); Publicação e sincronização (leitura e
     escrita); Vendas e envios (leitura e escrita); Comunicações pós-venda (leitura e escrita).
   - **Notificações**: pode deixar em branco agora. Quando a rota existir, a URL será
     `<APP_URL>/api/canais/mercado-livre/notificacoes`, com os tópicos Orders, Items, Shipments e Questions.
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
| `CODIGO_CONTA_DEV` | uma senha provisória sua, com 12 caracteres ou mais |

Para gerar `SEGREDO_SESSAO` e `CHAVE_TOKENS` (rodar duas vezes, um valor para cada):

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 4. Testar

1. Abra `<APP_URL>/api/dev/entrar?codigo=<CODIGO_CONTA_DEV>`. Isso entra numa "Conta de
   desenvolvimento" (provisória, até existir cadastro e login) e abre a tela **Canais**.
2. Clique em **Conectar Mercado Livre**, entre no ML e autorize o Haul.
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
