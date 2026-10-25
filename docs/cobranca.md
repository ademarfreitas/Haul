# Cobrança da mensalidade e painel do dono (/admin)

## O que já existe (25/10/2026)

- **/admin (Assinantes)**: só abre para quem tem o e-mail de login em `ADMIN_EMAILS` (Vercel > Settings >
  Environment Variables). Para os outros dá 404. O item "Assinantes" aparece no menu só para o dono.
- Mostra cada conta: nome e e-mail de quem se cadastrou, plano, situação, quando vence (fim do teste ou do
  período pago), quanto já pagou. Filtros: em teste, em dia, inadimplentes, venceram sem renovar, cancelados.
- Números do mês: o que entrou, custos estimados e resultado, receita recorrente (MRR), testes que vencem em 7 dias.
- **Registrar pagamento à mão** (Pix direto, por exemplo): grava a mensalidade (ou anuidade), empurra o "pago até" um mês (ou 12) e,
  na primeira mensalidade, dá os 30 dias de prêmio a quem indicou.

## Plano anual (25/10/2026)

- Preço do ano = 10 mensalidades (uns 17% de desconto, "2 meses grátis"): Essencial R$ 199, Profissional R$ 499,
  Avançado R$ 799 (`precoAnualCentavos` em `lib/planos.ts`). Cobrado de uma vez, vale 12 meses.
- O ciclo (mensal ou anual) fica em `contas.ciclo` e em cada linha de `cobrancas.ciclo` (migração `0004_ciclo_anual`).
- Quem escolhe: no site (botão Mensal/Anual nos planos, leva `?ciclo=anual` ao cadastro), em Minha conta > Plano e
  cobrança, ou o dono ao lançar o pagamento no /admin ("12 meses (anual)").
- Na receita recorrente (MRR) o anual entra como 1/12 do valor por mês; em "Entrou este mês" entra inteiro no mês
  em que foi pago.

## Situação de cada conta (calculada pelas datas, `lib/assinantes.ts`)

| Situação | Regra |
|---|---|
| Teste grátis | nunca pagou e o teste (30 dias) ainda não acabou |
| Teste acabou, sem pagamento | teste acabou há até 5 dias |
| Não assinou | teste acabou há mais de 5 dias: conta só leitura |
| Em dia | pago até uma data futura |
| Inadimplente | mensalidade venceu há até 5 dias |
| Venceu e não renovou | venceu há mais de 5 dias: conta só leitura |
| Cancelada | marcada como cancelada |

O período pago continua de onde parou (fim do teste ou do último mês) quando o pagamento chega em dia ou na
tolerância; quem volta depois de ficar só leitura começa no dia do pagamento.

## Banco

Tabela `cobrancas` (migração `0003_cobrancas`): uma linha por mensalidade, com plano, valor, período, vencimento,
situação (pendente, paga, vencida, cancelada, estornada), forma (Pix, boleto, cartão, manual), taxa do provedor e
o id no provedor (único por provedor, para o aviso repetido não lançar duas vezes).

**Rodar no Neon:** em `C:\app\haul-novo`, `git pull` e depois `npm run db:migrar`. Antes disso o /admin abre, avisa
que falta a tabela e mostra entradas zeradas.

## Desconto de indicação

As duas pontas ganham 5% de desconto em 12 meses de plano. Quem entrou pelo link de outra conta ganha 12 meses no
cadastro; quem indicou ganha mais 12 meses (além dos 30 dias) toda vez que uma indicada paga a primeira vez. Os meses
se somam (duas indicações = 24 meses com 5%), o percentual não. Cada pagamento gasta os meses que cobre (mensalidade = 1,
anuidade = 12); no anual o desconto é 5% sobre a parte da anuidade que cai no saldo (12 meses = a anuidade inteira; quem pagou 1 mês e passou para o anual tem 5% sobre 11/12).
O saldo sai das datas, sem coluna nova: `saldoDeMeses` (lib/planos.ts) junta os créditos (`indicacoes.criado_em` da
indicada e `recompensa_concedida_em` de quem indicou) com os pagamentos em ordem de data. O "+ Pagamento" do /admin
calcula sozinho, grava em `valor_centavos` o valor já com desconto e anota o desconto na observação. A coluna Plano
mostra quanto sai o próximo pagamento de cada conta com saldo.

## Custos

Estimativas de `plist/docs/custo-e-planos.md` em `lib/assinantes.ts`: fixo R$ 330/mês (Vercel, Neon, Resend),
imposto 6% do que entrou, taxa do provedor (R$ 1,99 quando ele não informar) e infraestrutura por conta em uso.
IA e SMS entram quando forem ligados. Trocar pelos valores das faturas quando houver.

## Próximo passo: provedor de cobrança

O provedor cria a cobrança recorrente (Pix, boleto ou cartão) e avisa o Plist pelo webhook quando pagam. O webhook
grava em `cobrancas` e chama a mesma regra do pagamento manual. Precisa de conta própria do Plist (nunca a do Zappy
Core). Falta também uma rotina diária que gere a cobrança 5 dias antes do vencimento, mande o e-mail com o link e
deixe a conta só leitura depois da tolerância (hoje o sistema ainda não bloqueia nada).
