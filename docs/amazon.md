# Conectar a Amazon — passo a passo

O Plist conecta a conta do lojista na Amazon.com.br pela Selling Partner API (SP-API). O lojista
clica em **Conectar Amazon**, entra no Seller Central, autoriza e volta para o Plist. O Plist guarda
só os tokens, cifrados com `CHAVE_TOKENS`, na tabela `conexoes_canal` (o `selling_partner_id` vai em
`usuario_externo`).

> Client secret, códigos e tokens ficam só no `.env.local` do PC e nas variáveis de ambiente da Vercel.
> Nunca em chat, print ou commit.

## 0. O que a Amazon pede (e o que o Plist ainda não tem)

| Item | Para quê | Situação |
| --- | --- | --- |
| Conta de vendedor **Profissional** na Amazon.com.br (R$ 19/mês) | Testar: o dono do Plist autoriza o próprio app | Aceita CPF; dá para fazer já |
| **Perfil de desenvolvedor público** | Atender lojistas que não são o dono do app | Pede nome da organização, site público, contato, casos de uso, permissões e questionário de segurança |
| **Site público** em https com **política de privacidade e termos** | Exigido no perfil | Falta: o site existe, mas sem privacidade/termos |
| CNPJ | A documentação não exige explicitamente | Na prática, uma empresa formal com domínio próprio passa mais fácil na análise |
| Conta **AWS** (nível gratuito) | Só para os avisos de pedido na hora (fila SQS) | Opcional: sem ela, os pedidos chegam pelo botão Atualizar pedidos |

O Plist **não pede** os papéis de dados pessoais protegidos (nome e endereço do comprador), que exigem
auditoria extra da Amazon. Cidade, UF e CEP do pedido chegam sem eles.

## 1. Perfil de desenvolvedor

1. Entre no **Solution Provider Portal** (https://solutionproviderportal.amazon.com, em Settings →
   Developer Profile) ou no Seller Central em **Apps e serviços → Desenvolver apps**.
2. **Contact Information**: nome da organização (Plist), site (`https://plist.com.br`), país, contato.
3. **Data Access**: *Public Developer* (aplicativo usado por outros vendedores).
4. **Roles** (permissões): *Product Listing*, *Inventory and Order Tracking*, *Pricing* e
   *Finance and Accounting*. **Não** marque *Direct-to-Consumer Shipping* nem outros papéis restritos.
5. **Use Cases**: descreva o Plist (cadastro único, publicação em vários marketplaces, retirada do
   anúncio dos outros canais quando vende, pedidos, etiqueta e conferência de taxas).
6. **Security Controls**: responda o questionário de acordo com o que o Plist faz de verdade
   (tokens cifrados com AES-256-GCM, HTTPS, acesso restrito, sem guardar dados pessoais do comprador).
   Respostas abertas com menos de 500 caracteres.
7. Aceite as políticas (AUP, DPP) e **Register**. A Amazon analisa; se ela perguntar algo, responda em
   até 5 dias, ou o pedido é fechado.
8. Uma vez por ano a Amazon pede para confirmar o perfil de novo.

## 2. App

1. Em **Develop Apps → Add new app client**: nome Plist, tipo **SP API**, os mesmos papéis do perfil.
2. **OAuth Login URI**: `<APP_URL>/api/canais/amazon/conectar` (usado quando o lojista vem da Appstore
   da Amazon).
3. **OAuth Redirect URI**: `<APP_URL>/api/canais/amazon/callback`, ex.:
   `https://haul1.vercel.app/api/canais/amazon/callback` (depois `https://app.plist.com.br/...`).
4. Anote o **App ID** (`amzn1.sp.solution...`) e, em **LWA credentials → View**, o **Client ID** e o
   **Client Secret**.
5. O app nasce em **rascunho** (Draft). Nesse estado ele já pode ser autorizado com `version=beta` (o
   Plist faz isso sozinho enquanto `AMAZON_APP_PUBLICADO` estiver vazio). Para atender lojistas em
   geral, publique o app (pode ser sem aparecer na Appstore) e ponha `AMAZON_APP_PUBLICADO=1`.
6. A Amazon exige trocar o **Client Secret a cada 180 dias**. Ela avisa por e-mail; troque no
   `.env.local` e na Vercel no mesmo dia.

## 3. Variáveis

No `.env.local` e na Vercel (Settings → Environment Variables), depois **Redeploy**:

| Variável | O que é |
| --- | --- |
| `AMAZON_APP_ID` | App ID (`amzn1.sp.solution...`) |
| `AMAZON_LWA_CLIENT_ID` | Client ID das credenciais LWA |
| `AMAZON_LWA_CLIENT_SECRET` | Client Secret das credenciais LWA |
| `AMAZON_REDIRECT_URI` | `<APP_URL>/api/canais/amazon/callback`, igual ao do app |
| `AMAZON_APP_PUBLICADO` | vazio enquanto rascunho; `1` depois de publicado |
| `AMAZON_DESTINO_AVISOS` | opcional, passo 5 |
| `AMAZON_AVISOS_CHAVE` | opcional, passo 5 |

## 4. Testar

1. Entre no Plist e abra **Canais**. Clique em **Conectar Amazon**.
2. No Seller Central, entre com a sua conta de vendedor e autorize. Você volta para Canais com
   "Amazon conectada".
3. Clique em **Testar**: deve mostrar o vendedor e o marketplace `Amazon.com.br`.

Erros comuns: `invalid_client` (Client ID/Secret trocados ou secret vencido), `invalid_grant`
(Redirect URI diferente do cadastrado no app, ou demorou mais de 5 minutos para voltar) e
`Unauthorized` (papel que falta no app).

## 5. Avisos de pedido na hora (opcional)

A Amazon só entrega o aviso de pedido (`ORDER_CHANGE`) numa fila **SQS** da AWS. Um **EventBridge Pipe**
leva cada mensagem da fila para o Plist:

1. Na AWS (região `us-east-1`), crie a fila SQS **padrão** `plist-pedidos-amazon`. Na política de
   acesso, permita `sqs:SendMessage` e `sqs:GetQueueAttributes` para o principal
   `arn:aws:iam::437568002678:root` (é a conta da SP-API que publica os avisos).
2. No PC, com as variáveis LWA no `.env.local`:
   `node scripts/amazon-destino-avisos.mjs <ARN da fila>`. Ele mostra o `destinationId`: ponha em
   `AMAZON_DESTINO_AVISOS`.
3. Gere uma chave (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) e
   ponha em `AMAZON_AVISOS_CHAVE`.
4. No EventBridge, crie um **API destination**: endpoint `<APP_URL>/api/canais/amazon/notificacoes`,
   método POST, conexão com autorização **API key**, nome do cabeçalho `x-plist-chave` e o valor da
   chave do passo 3.
5. Crie um **Pipe**: origem a fila do passo 1 (lote de 1 mensagem), destino o API destination do passo 4.
6. Redeploy na Vercel e **reconecte** a Amazon em Canais: é na conexão que o Plist assina os avisos
   daquela conta.

A rota confere a chave, guarda cada aviso em `eventos_canal` (sem duplicar) e busca os pedidos da conta
logo depois de responder.

## 6. Como funciona por dentro

- Autorização pelo *website authorization workflow*: `sellercentral.amazon.com.br/apps/authorize/consent`
  com `state` próprio (cookie assinado), volta com `spapi_oauth_code` (vale 5 minutos), que vira refresh
  token em `api.amazon.com/auth/o2/token`.
- O refresh token não muda; o access token vale 1 hora e vai no cabeçalho `x-amz-access-token` (não há
  mais assinatura AWS). Se a renovação for recusada, a conexão fica "expirada" e nasce a tarefa
  "Reconectar a Amazon". A autorização do lojista vence em 1 ano.
- O Brasil fica na região América do Norte: `sellingpartnerapi-na.amazon.com`, marketplace
  `A2Q3Y263D00KWC`.
- A Amazon limita muito as chamadas por segundo. O Plist espera e tenta de novo quando ela responde 429,
  e busca a taxa real de no máximo 25 pedidos por atualização.

## 7. O que já funciona com a Amazon

- **Inventário → Sincronizar anúncios**: traz os anúncios (listings) da Amazon.com.br. Na Amazon o
  anúncio é o SKU do vendedor: anúncio com o mesmo SKU de uma peça que já existe (ex.: veio do ML) é
  ligado a ela, sem duplicar. Anúncio FBA não mexe na quantidade da peça.
- **Pedidos / Tarefas → Atualizar pedidos**: vendas dos últimos 60 dias (Orders API v2026-01-01), baixa
  de estoque no Plist, taxa real pelas finanças da Amazon (sai quando o pedido é enviado) e tarefa de
  etiqueta. A etiqueta do **DBA** e do **envio próprio** sai no Seller Central: o botão
  **Etiqueta no Seller Central** abre o pedido lá. No **FBA** é a Amazon quem envia.
- **Publicar na Amazon** (`/novo-anuncio/amazon`, o selo AZ no Estoque, ou o botão depois de publicar no
  ML): procura o produto no catálogo por título ou EAN e **vende nele** (o caminho mais comum); se não
  existir, **cria o produto** com as fotos da peça, o tipo de produto e a ficha que a Amazon exige.
  Sem EAN, a conta precisa da isenção de código de barras (GTIN) aprovada pela Amazon.
  **Peça nova** (`?nova=1`) é sempre oferta num produto do catálogo.
  A Amazon processa o anúncio em alguns minutos: ele fica "publicando" até a próxima sincronização.
- **Multivenda**: vendeu em outro canal, o Plist zera a quantidade do anúncio na Amazon (na Amazon não
  existe pausar; sem estoque ele sai da vitrine), ou ajusta a quantidade se sobrar. Anúncio FBA não dá
  para zerar pela API: vira a tarefa "Venda dupla". Venda cancelada devolve a quantidade.

## 8. Ainda não

- Etiqueta do DBA pela API: a Easy Ship API da Amazon não atende o Brasil; por isso o botão abre o
  Seller Central.
- Confirmar o envio próprio (código de rastreio) pelo Plist: hoje é no Seller Central.
- Nada disso foi testado contra a Amazon de verdade ainda; só com uma Amazon simulada no teste local.
