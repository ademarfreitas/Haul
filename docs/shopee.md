# Conectar a Shopee — passo a passo

O Plist conecta a loja do lojista pela autorização oficial da Shopee Open Platform (v2). O lojista
clica em **Conectar Shopee**, entra na Shopee, autoriza e volta para o Plist. O Plist guarda só os
tokens, cifrados com `CHAVE_TOKENS`, na tabela `conexoes_canal` (o `shop_id` vai em `usuario_externo`).

> Partner Key, códigos e tokens ficam só no `.env.local` do PC e nas variáveis de ambiente da Vercel.
> Nunca em chat, print ou commit.

## 1. Conta de desenvolvedor e app

1. Em https://open.shopee.com, com a conta de dono do Plist, conclua o cadastro de desenvolvedor
   como **Third-party Partner Platform** (sistema que atende várias lojas).
2. **App Management → Create App**. Tipo: ERP/sistema de gestão (o nome exato muda; escolha o que
   fala em gestão de produtos e pedidos para vários vendedores). Nome: Plist.
3. Na página do app, anote o **Test Partner ID** e a **Test Partner Key** (sandbox). Os de produção
   (**Live**) só aparecem depois do "Go Live", que a Shopee analisa (pede dados da empresa/CNPJ).
4. **Redirect URL Domain**: o endereço do Plist, ex.: `https://haul1.vercel.app` (depois
   `https://app.plist.com.br`). O caminho completo do retorno é
   `<APP_URL>/api/canais/shopee/callback`.
5. **Push Mechanism** (avisos): URL `<APP_URL>/api/canais/shopee/notificacoes`. Marque pelo menos
   os avisos de pedido (status do pedido, número de rastreio) e de autorização cancelada/vencida.
   A rota confere a assinatura de cada aviso com a Partner Key e guarda em `eventos_canal`.
6. Veja na página do app qual é o **host da API** (sandbox e produção têm hosts diferentes). Se for
   diferente do padrão do Plist (sandbox `openplatform.sandbox.test-stable.shopee.sg`, produção
   `openplatform.shopee.com.br`), preencha `SHOPEE_API_URL` com ele.

## 2. Loja de teste

No sandbox, crie uma **loja de teste** (menu Sandbox/Test Account do console), região Brasil.
Ela tem login e senha próprios: é com ela que você autoriza o Plist no teste.

## 3. Variáveis

No `.env.local` e na Vercel (Settings → Environment Variables), depois **Redeploy**:

| Variável | O que é |
| --- | --- |
| `SHOPEE_PARTNER_ID` | Partner ID (de teste agora; o Live depois do Go Live) |
| `SHOPEE_PARTNER_KEY` | Partner Key do mesmo ambiente |
| `SHOPEE_REDIRECT_URI` | `<APP_URL>/api/canais/shopee/callback` |
| `SHOPEE_AMBIENTE` | `sandbox` ou `producao` |
| `SHOPEE_API_URL` | opcional, só se o host do console for outro |

## 4. Testar

1. Entre no Plist e abra **Canais**. Clique em **Conectar Shopee**.
2. Na Shopee, entre com a loja de teste e autorize. Você volta para Canais com "Shopee conectada".
3. Clique em **Testar**: deve mostrar o nome da loja e `"regiao": "BR"`.

Erros comuns: `error_sign` (Partner ID/Key de um ambiente com o host do outro) e `error_auth`
(domínio do retorno diferente do cadastrado no console).

## 5. Como funciona por dentro

- Toda chamada leva `partner_id`, `timestamp` e `sign` = HMAC-SHA256 com a Partner Key de
  `partner_id + caminho + timestamp`, e nas chamadas da loja também `+ access_token + shop_id`.
- O access token vale cerca de 4 horas; o refresh token, cerca de 30 dias, e cada renovação devolve
  um novo. Se a renovação for recusada, a conexão fica "expirada" e nasce a tarefa "Reconectar a Shopee".
- A autorização da loja vence em até 1 ano: aí o lojista conecta de novo pelo mesmo botão.

## 6. O que já funciona com a Shopee

- **Inventário → Sincronizar anúncios**: traz os anúncios ativos e deslistados. Anúncio com o mesmo
  SKU de uma peça que já existe (ex.: veio do ML) é ligado a ela, sem duplicar.
- **Pedidos / Tarefas → Atualizar pedidos**: vendas dos últimos 60 dias, taxa real pelo escrow, baixa
  de estoque no Plist e tarefa de etiqueta. Botão **Organizar envio** (pedido pago): organiza por
  postagem quando a Shopee não pede escolha; coleta com horário fica no Seller Centre. Depois,
  **Imprimir** baixa a etiqueta oficial em PDF.
- **Publicar na Shopee** (`/novo-anuncio/shopee`, ou o selo SP no Estoque): publica uma peça do
  estoque com as fotos dela, pedindo categoria, ficha obrigatória, marca, peso, medidas e envio.

Ainda não: tirar o anúncio do outro canal quando vende (vale para todos os canais e vem a seguir) e
criar peça nova direto na Shopee sem passar pelo ML.
