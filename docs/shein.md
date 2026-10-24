# Conectar a Shein — passo a passo

O Plist conecta a loja do lojista pela autorização oficial do **SHEIN Open Platform**. O lojista clica
em **Conectar Shein**, entra na conta de vendedor da Shein, autoriza e volta para o Plist. A Shein entrega
duas chaves da loja (*open key ID* e *secret key*). O Plist guarda a secret key cifrada com `CHAVE_TOKENS`
na tabela `conexoes_canal` (o open key ID vai em `usuario_externo`). As chaves não vencem: valem até o
lojista tirar a autorização no painel da Shein.

> App Secret e secret keys ficam só no `.env.local` do PC, nas variáveis de ambiente da Vercel e no banco
> (cifradas). Nunca em chat, print ou commit.

## 1. Cadastro e aprovação (o que depende do Plist)

1. Em https://open.sheincorp.com, crie a conta de desenvolvedor com os dados da empresa do Plist. O tipo
   certo é o de **sistema que atende vários vendedores** (ISV / ERP de terceiros), não o de vendedor que
   integra o próprio sistema.
2. Crie o app (nome: Plist) e peça as permissões de **produtos**, **estoque**, **pedidos** e **logística**.
3. A Shein analisa o pedido. O cadastro pede dados da empresa: conte com a exigência de **CNPJ**.
4. Aprovado, o console mostra o **App ID** e o **App Secret**. Cadastre o endereço de volta:
   `<APP_URL>/api/canais/shein/callback`.
5. Para testar antes da produção, peça à Shein (chamado no portal ou openapi@shein.com) uma conta de
   vendedor de teste. O ambiente de teste não é self-service como o sandbox da Shopee.

### Plano B enquanto o app não sai

Em **Canais → Shein → Já tenho as chaves da Shein**, o lojista cola o open key ID e a secret key que a
própria Shein entrega a ele para integrar um sistema (como fazem alguns ERPs). O Plist confere as chaves
numa chamada antes de gravar. Serve para testar com uma loja real sem o app aprovado.

## 2. Variáveis

No `.env.local` e na Vercel (Settings → Environment Variables), depois **Redeploy**:

| Variável | O que é |
| --- | --- |
| `SHEIN_APP_ID` | App ID do console |
| `SHEIN_APP_SECRET` | App Secret do console (também abre a secret key que a Shein devolve) |
| `SHEIN_REDIRECT_URI` | `<APP_URL>/api/canais/shein/callback` |
| `SHEIN_AMBIENTE` | `teste` ou `producao` |
| `SHEIN_API_URL` / `SHEIN_AUTH_URL` | opcionais, só se o console mostrar outros endereços |

## 3. Testar

1. Entre no Plist e abra **Canais**. Clique em **Conectar Shein**.
2. Na Shein, entre com a loja e autorize. Você volta para Canais com "Shein conectada".
3. Clique em **Testar**: deve mostrar o nome da loja.

## 4. Como funciona por dentro

- A página de autorização (`openapi-sem.sheincorp.com/#/empower`) recebe `appid`, `redirectUrl` em base64
  e `state`, e volta com `tempToken` (vale 10 minutos) e o mesmo `state`.
- `/open-api/auth/get-by-token` troca o tempToken pelas chaves. A secret key vem cifrada em AES-128-CBC
  (chave = 16 primeiros bytes do App Secret, IV = `space-station-de`).
- Toda chamada leva `x-lt-openKeyId`, `x-lt-timestamp` (ms) e `x-lt-signature` =
  5 letras aleatórias + base64 do HMAC-SHA256 em hex de `openKeyId&timestamp&caminho`, com a chave
  `secretKey + as 5 letras`. A troca do tempToken assina igual, com App ID e App Secret.
- A resposta é `{ code, msg, info }`; só `code = "0"` é sucesso.
- Se a Shein recusar as chaves (HTTP 401/403), a conexão fica "revogada" e nasce a tarefa
  "Reconectar a Shein".

## 5. O que já funciona com a Shein

- **Inventário → Sincronizar anúncios**: traz os produtos da loja. Cada cor (SKC) vira um anúncio no Plist,
  com o menor preço e a soma do estoque dos tamanhos. Produto com o mesmo SKU de vendedor de uma peça que já
  existe (ex.: veio do ML) é ligado a ela, sem duplicar.
- **Pedidos / Tarefas → Atualizar pedidos**: vendas dos últimos 30 dias, taxa real (comissão + taxa de
  serviço), baixa de estoque no Plist, tarefa **Emitir a NF-e** quando a Shein ainda não tem a nota e
  tarefa de etiqueta. **Imprimir** abre a etiqueta oficial em PDF (a Shein só libera depois da NF-e).
- **Publicar na Shein** (`/novo-anuncio/shein`, ou o selo SH no Estoque): publica uma peça do estoque com
  as fotos dela, pedindo categoria, cor, tamanho, ficha obrigatória, marca, peso e medidas. A Shein analisa
  antes de pôr na vitrine: o anúncio fica "publicando" até a próxima sincronização encontrá-lo no ar.
- **Multivenda**: vendeu em outro canal, o Plist zera o estoque da peça na Shein (ou acerta a quantidade,
  se sobrar e o anúncio tiver um tamanho só). Venda cancelada devolve o estoque.

## 6. O que falta conferir no primeiro teste real

A documentação oficial só abre com login. A integração foi montada com dois clientes abertos que já usam
a API (`github.com/XIE7654/shein_spi` e `github.com/fangwater/shein_manager`) e testada contra uma Shein
falsa local que confere assinatura e cifra do mesmo jeito que eles. Pontos a conferir com a loja real,
todos em `CAMINHOS_SHEIN` (lib/shein.ts) ou nos tipos de cada arquivo:

- caminho e corpo da mudança de estoque do vendedor brasileiro (hoje `/open-api/gsp/goods/change-inventory`);
- campos do cadastro de produto (`publishOrEdit`): nomes e quais atributos a categoria exige;
- formato da árvore de categorias, do modelo de atributos e da lista de sites;
- campo com o endereço do PDF da etiqueta (`print-express-info`);
- avisos em tempo real (webhook) ainda não estão ligados: por enquanto as vendas entram pelo botão
  **Atualizar pedidos**.
- peça nova cadastrada direto na Shein (sem passar pelo estoque) ainda não existe.
