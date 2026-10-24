# Domínio plist.com.br

- **plist.com.br** e **www.plist.com.br**: o site (só a página inicial; qualquer outro caminho vai para o app).
- **app.plist.com.br**: o sistema (raiz = /inventario). É o `APP_URL`, e o login fica sempre aqui.
- O mesmo projeto da Vercel atende os três; quem separa é o `next.config.ts`.

## 1. Vercel: adicionar os domínios

Projeto `haul-site-ahhz` → **Settings → Domains** → **Add Domain**, um de cada vez:

1. `plist.com.br` (quando perguntar, aceite também `www.plist.com.br` redirecionando para `plist.com.br`).
2. `app.plist.com.br`.
3. Opcional: em `haul1.vercel.app`, **Edit → Redirect to** `app.plist.com.br` (senão quem entrar pelo
   endereço antigo faz login lá e cai deslogado no novo).

A Vercel mostra os registros DNS que espera. Em geral:

| Nome | Tipo | Valor |
|---|---|---|
| `plist.com.br` (raiz) | A | `76.76.21.21` |
| `www` | CNAME | `cname.vercel-dns.com` |
| `app` | CNAME | `cname.vercel-dns.com` |

Se a tela da Vercel mostrar outro valor (ela às vezes dá um CNAME/IP próprio do projeto), use o dela.

## 2. registro.br: criar os registros

registro.br → **Meus domínios → plist.com.br**:

1. Em **DNS**, se ainda estiver nos servidores do registro.br, clique em **Editar zona** (pode ser preciso
   **Utilizar DNS do Registro.br** / modo avançado primeiro e esperar alguns minutos).
2. **Nova entrada** para cada linha da tabela acima (na raiz, deixe o nome em branco).
3. Salve. Costuma propagar em minutos, pode levar algumas horas.
4. Volte à Vercel: os três domínios devem ficar **Valid Configuration**, com o certificado https emitido sozinho.

## 3. Vercel: variáveis do ambiente Production

**Settings → Environment Variables** (Production), troque `haul1.vercel.app` por `app.plist.com.br`:

| Variável | Valor |
|---|---|
| `APP_URL` | `https://app.plist.com.br` |
| `ML_REDIRECT_URI` | `https://app.plist.com.br/api/canais/mercado-livre/callback` |
| `SHOPEE_REDIRECT_URI`, `AMAZON_REDIRECT_URI`, `MAGALU_REDIRECT_URI`, `SHEIN_REDIRECT_URI` | o mesmo padrão, se já existirem |

Depois **Deployments → Redeploy** do último deploy de produção.

## 4. Mercado Livre (DevCenter)

developers.mercadolivre.com.br → **Minhas aplicações** → app do Plist → **Editar**:

- **URI de redirect**: `https://app.plist.com.br/api/canais/mercado-livre/callback` (igual, letra por letra,
  ao `ML_REDIRECT_URI`). Pode deixar o antigo junto até confirmar que o novo funciona.
- **URL de notificações**: `https://app.plist.com.br/api/canais/mercado-livre/notificacoes`.

Os outros canais (Shopee, Amazon, Magalu, Shein) ainda não têm app cadastrado; quando tiverem, use
`https://app.plist.com.br` nos endereços dos guias de cada um.

## 5. Conferir

1. `https://plist.com.br` abre o site; **Entrar** leva a `https://app.plist.com.br/entrar`.
2. Entre com sua conta: deve abrir o Inventário em `app.plist.com.br`.
3. Em **Canais**, reconecte o Mercado Livre (o login é novo neste endereço) e sincronize.
