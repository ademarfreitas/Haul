# Cobrança da mensalidade e painel do dono (/admin)

## O que já existe (25/10/2026)

- **/admin (Assinantes)**: só abre para quem tem o e-mail de login em `ADMIN_EMAILS` (Vercel > Settings >
  Environment Variables). Para os outros dá 404. O item "Assinantes" aparece no menu só para o dono.
- Mostra cada conta: nome e e-mail de quem se cadastrou, plano, situação, quando vence (fim do teste ou do
  período pago), quanto já pagou. Filtros: em teste, em dia, inadimplentes, venceram sem renovar, cancelados.
- Números do mês: o que entrou, custos estimados e resultado, receita recorrente (MRR), testes que vencem em 7 dias.
- **Registrar pagamento à mão** (Pix direto, por exemplo): grava a mensalidade, empurra o "pago até" um mês e,
  na primeira mensalidade, dá os 30 dias de prêmio a quem indicou.

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

## Custos

Estimativas de `plist/docs/custo-e-planos.md` em `lib/assinantes.ts`: fixo R$ 330/mês (Vercel, Neon, Resend),
imposto 6% do que entrou, taxa do provedor (R$ 1,99 quando ele não informar) e infraestrutura por conta em uso.
IA e SMS entram quando forem ligados. Trocar pelos valores das faturas quando houver.

## Próximo passo: provedor de cobrança

O provedor cria a cobrança recorrente (Pix, boleto ou cartão) e avisa o Plist pelo webhook quando pagam. O webhook
grava em `cobrancas` e chama a mesma regra do pagamento manual. Precisa de conta própria do Plist (nunca a do Zappy
Core). Falta também uma rotina diária que gere a cobrança 5 dias antes do vencimento, mande o e-mail com o link e
deixe a conta só leitura depois da tolerância (hoje o sistema ainda não bloqueia nada).
