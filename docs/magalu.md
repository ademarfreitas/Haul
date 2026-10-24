# Conectar a Magalu — passo a passo

O Plist conecta a loja do lojista pela autorização oficial da Magalu (API aberta, ID Magalu, OAuth 2.0).
O lojista clica em **Conectar Magalu**, entra no ID Magalu com o login da empresa, escolhe a loja,
autoriza e volta para o Plist. O Plist guarda só os tokens, cifrados com `CHAVE_TOKENS`, na tabela
`conexoes_canal` (o id da loja, o "tenant", vai em `usuario_externo`).

> Client Secret, códigos e tokens ficam só no `.env.local` do PC e nas variáveis de ambiente da Vercel.
> Nunca em chat, print ou commit.

## 0. Quem precisa de quê

- **O Plist (integrador)** precisa só de uma conta no ID Magalu e de um "client" criado com a ferramenta
  `idm`. Não há programa de parceiro com análise da empresa. Algumas permissões passam por aprovação
  da Magalu, uma a uma (o `idm` mostra quais ficam pendentes).
- **O lojista** precisa vender na Magalu, e a Magalu só aceita loja com **CNPJ**. Na autorização ele entra
  com o login da empresa (pessoa jurídica). Brechó pessoa física não consegue usar este canal.
- **Teste**: o sandbox aceita qualquer conta do ID Magalu, até pessoa física, e cria uma loja fictícia.

## 1. Conta e ferramenta `idm`

1. Crie a conta em https://id.magalu.com com o e-mail de dono do Plist (pode ser o mesmo do Portal do
   Seller, se já tiver).
2. Baixe o `idm` para Windows na página de releases do repositório `luizalabs/id-magalu-cli` no GitHub.
   Renomeie o arquivo para `idm.exe` e coloque numa pasta que o PowerShell enxergue (a documentação
   sugere `C:\Windows\System32`).
3. No PowerShell: `idm login`. Abre o navegador; entre e aceite pelo menos "Criar client" e "Atualizar client".

## 2. Criar o client do Plist

Os termos de uso e a política de privacidade precisam ter endereço público (a Magalu mostra os links
ao lojista). Troque `SEU-ENDERECO` por `https://app.plist.com.br`.
Num PowerShell, tudo numa linha só:

```
idm client create --name "Plist" --description "Multivenda para lojistas: anúncios, estoque e pedidos" --terms-of-use "https://plist.com.br/termos" --privacy-term "https://plist.com.br/privacidade" --redirect-uris "https://SEU-ENDERECO/api/canais/magalu/callback" --audience "https://api.magalu.com https://api-sandbox.magalu.com https://services.magalu.com" --scopes "open:portfolio-skus-seller:read open:portfolio-skus-seller:write open:portfolio-prices-seller:read open:portfolio-prices-seller:write open:portfolio-stocks-seller:read open:portfolio-stocks-seller:write open:order-order-seller:read open:order-delivery-seller:read open:order-delivery-seller:write open:order-invoice-seller:read open:order-logistics-seller:read open:order-logistics-seller:write" --scopes-default "open:portfolio-skus-seller:read open:portfolio-skus-seller:write open:portfolio-prices-seller:read open:portfolio-prices-seller:write open:portfolio-stocks-seller:read open:portfolio-stocks-seller:write open:order-order-seller:read open:order-delivery-seller:read open:order-delivery-seller:write open:order-invoice-seller:read open:order-logistics-seller:read open:order-logistics-seller:write" --access-token-exp 7200 --always-require-login false
```

A resposta mostra **UUID**, **Client ID** e **Client Secret**. O Secret aparece uma vez só: guarde no
`.env.local` na hora. Se perder, é preciso criar outro client.

Depois, `idm client list` mostra cada permissão como AVAILABLE ou PENDING. Se alguma ficar PENDING, a
Magalu analisa; o Plist funciona com as que estiverem liberadas.

## 3. Variáveis

No `.env.local` e na Vercel (Settings → Environment Variables), depois **Redeploy**:

| Variável | O que é |
| --- | --- |
| `MAGALU_CLIENT_ID` | Client ID do passo 2 |
| `MAGALU_CLIENT_SECRET` | Client Secret do passo 2 |
| `MAGALU_REDIRECT_URI` | `<APP_URL>/api/canais/magalu/callback` (igual ao `--redirect-uris`) |
| `MAGALU_AMBIENTE` | `sandbox` agora; `producao` quando for para lojas de verdade |
| `MAGALU_API_URL` | opcional, só para apontar a outro host |
| `MAGALU_WEBHOOK_SECRET` | segredo `whsec_...` dos avisos (passo 6) |

## 4. Testar no sandbox

1. Entre no Plist, abra **Canais** e clique em **Conectar Magalu**.
2. No ID Magalu, entre (no sandbox pode ser sua conta pessoal), escolha a conta e autorize.
3. O Plist cria a loja de teste no sandbox (`PUT /v1/samples/onboarding`) e volta para Canais com
   "Magalu conectada". **Testar** deve mostrar o nome da loja e `"sandbox": true`.
4. Publique uma peça do estoque em **Novo anúncio → Publicar na Magalu** (ou pelo selo MG no Estoque).
   Se a Magalu recusar algum campo, a mensagem mostra qual: é o ajuste que falta no corpo do SKU
   (`lib/magalu-anuncio.ts`), porque a documentação pública não deixa ler os nomes exatos dos campos.
5. Para simular uma venda, o sandbox tem `POST /v1/samples/orders` (com o SKU publicado). Depois,
   **Pedidos → Atualizar pedidos** traz a venda, baixa o estoque e tira a peça dos outros canais.

Os dados do sandbox são apagados a cada 3 meses.

## 5. O que já funciona com a Magalu

- **Inventário → Sincronizar anúncios**: traz os SKUs (menos os do Full da Magalu e os apagados), com preço
  e estoque do canal Magazine Luiza. SKU igual ao de uma peça que já existe (veio do ML ou da Shopee)
  liga o anúncio a ela, sem duplicar.
- **Pedidos / Tarefas → Atualizar pedidos**: vendas dos últimos 60 dias, comissão real (taxa no 2º momento),
  baixa de estoque e tarefas. Pedido aprovado abre a tarefa "Emitir a NF-e"; com a NF-e aceita, "Imprimir
  etiqueta e despachar". As duas, por enquanto, levam ao Portal do Seller (https://seller.magalu.com).
- **Publicar na Magalu** (`/novo-anuncio/magalu`): peça do estoque, com as fotos dela, marca, EAN opcional,
  peso e medidas. A Magalu modera: o anúncio fica "publicando" até a próxima sincronização.
- **Multivenda**: vendeu em outro canal, o Plist zera (ou ajusta) o estoque do SKU na Magalu, que não tem
  pausa pela API. Venda na Magalu tira a peça do ML e da Shopee. Venda cancelada devolve o estoque.

## 6. Avisos (webhooks)

A rota `<APP_URL>/api/canais/magalu/notificacoes` recebe os avisos, confere a assinatura
(`X-Signature-256` = HMAC-SHA256 de `timestamp.corpo` com o segredo) e, se for de pedido ou entrega,
busca as vendas da loja na hora. A inscrição é por loja (`PUT /v1/onboarding/signup`) e devolve o segredo
`whsec_...` uma vez só. Ainda falta conferir no sandbox o formato da inscrição e os nomes dos tópicos;
até lá, use **Atualizar pedidos**.

## 7. Ainda por fazer (depois de testar no sandbox)

- Enviar a NF-e (`POST /seller/v1/deliveries/{id}/invoices`) e gerar a etiqueta do Magalu Entregas pela
  API, para o lojista não precisar ir ao portal.
- Inscrever os avisos de cada loja automaticamente ao conectar.
- Categoria e ficha técnica no cadastro (`/seller/v1/portfolios/categories/{id}/datasheet`).
