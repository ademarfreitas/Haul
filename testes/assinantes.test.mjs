// Situação das assinaturas, período pago e custos do /admin (puras). Rodar com: npm run testar
import assert from "node:assert/strict";
import { PLANOS, economiaAnual } from "../lib/planos.ts";
import { custosDoMes, diasAteVencer, periodoDoPagamento, receitaRecorrente, situacaoDe } from "../lib/assinantes.ts";

const agora = new Date("2026-10-25T12:00:00Z");
const d = (s) => new Date(`${s}T12:00:00Z`);
const conta = (testeAte, pagoAte = null, situacaoAssinatura = "teste") => ({ situacaoAssinatura, testeAte: d(testeAte), pagoAte: pagoAte && d(pagoAte) });

// teste: dentro, acabou há pouco, acabou há mais de 5 dias
assert.equal(situacaoDe(conta("2026-11-10"), agora), "teste");
assert.equal(situacaoDe(conta("2026-10-22"), agora), "aguardando");
assert.equal(situacaoDe(conta("2026-10-10"), agora), "nao_converteu");
// pagante: em dia, atrasado na tolerância, vencido; cancelada ganha de tudo
assert.equal(situacaoDe(conta("2026-09-01", "2026-11-01", "ativa"), agora), "em_dia");
assert.equal(situacaoDe(conta("2026-09-01", "2026-10-21", "ativa"), agora), "inadimplente");
assert.equal(situacaoDe(conta("2026-09-01", "2026-10-15", "ativa"), agora), "vencida");
assert.equal(situacaoDe(conta("2026-11-10", null, "cancelada"), agora), "cancelada");
assert.equal(diasAteVencer(conta("2026-10-30"), agora), 5);
assert.equal(diasAteVencer(conta("2026-09-01", "2026-10-21", "ativa"), agora), -4);

// pagando durante o teste: começa no fim do teste
let p = periodoDoPagamento(conta("2026-11-10"), agora);
assert.equal(p.inicio.toISOString(), d("2026-11-10").toISOString());
assert.equal(p.fim.toISOString(), d("2026-12-10").toISOString());
// em atraso dentro da tolerância: continua de onde parou
p = periodoDoPagamento(conta("2026-09-01", "2026-10-21", "ativa"), agora);
assert.equal(p.inicio.toISOString(), d("2026-10-21").toISOString());
// voltou depois de ficar só leitura: começa hoje
p = periodoDoPagamento(conta("2026-09-01", "2026-09-01", "ativa"), agora);
assert.equal(p.inicio.toISOString(), agora.toISOString());
// 31 de janeiro + 1 mês = último dia de fevereiro
p = periodoDoPagamento(conta("2027-01-31"), agora);
assert.equal(p.fim.toISOString(), d("2027-02-28").toISOString());

// custos: fixo 330 + 6% de imposto + taxa (1,99 quando não informada) + infra de quem usa
const c = custosDoMes(
  [
    { valorCentavos: 4990, taxaProvedorCentavos: null },
    { valorCentavos: 1990, taxaProvedorCentavos: 0 },
  ],
  [
    { plano: "profissional", situacao: "em_dia" },
    { plano: "essencial", situacao: "em_dia" },
    { plano: null, situacao: "teste" },
    { plano: "avancado", situacao: "nao_converteu" },
  ],
);
assert.equal(c.total, 33_000 + Math.round(6980 * 0.06) + 199 + (120 + 60 + 60));
assert.equal(
  receitaRecorrente([
    { plano: "profissional", situacao: "em_dia" },
    { plano: "avancado", situacao: "inadimplente" },
    { plano: "essencial", situacao: "teste" },
  ]),
  4990 + 7990,
);

// plano anual: 12 meses de período, receita recorrente conta 1/12 do ano
p = periodoDoPagamento(conta("2026-11-10"), agora, "anual");
assert.equal(p.fim.toISOString(), d("2027-11-10").toISOString());
p = periodoDoPagamento(conta("2028-02-29"), agora, "anual");
assert.equal(p.fim.toISOString(), d("2029-02-28").toISOString());
assert.equal(
  receitaRecorrente([
    { plano: "essencial", ciclo: "anual", situacao: "em_dia" },
    { plano: "profissional", ciclo: "mensal", situacao: "em_dia" },
  ]),
  Math.round(19900 / 12) + 4990,
);
// anual = 10 mensalidades (199, 499, 799)
for (const pl of PLANOS) assert.equal(pl.precoAnualCentavos, pl.precoCentavos * 10);
assert.equal(economiaAnual(PLANOS[0]), 3980);
