// Desconto de indicação (5% em 12 meses para as duas pontas). Rodar com: npm run testar
import assert from "node:assert/strict";
import { PLANOS, descontoIndicacao, saldoDeMeses } from "../lib/planos.ts";

const [essencial, profissional, avancado] = PLANOS;
const d = (s) => new Date(`${s}T12:00:00Z`);
const pg = (s, ciclo = "mensal") => ({ pagaEm: d(s), ciclo });
const meses = (ini, n) => Array.from({ length: n }, (_, i) => pg(new Date(Date.UTC(2026, 10 + ini + i, 1)).toISOString().slice(0, 10)));

// mensal: 5% enquanto houver saldo
assert.equal(essencial.precoCentavos - descontoIndicacao(essencial, "mensal", 12), 1890);
assert.equal(profissional.precoCentavos - descontoIndicacao(profissional, "mensal", 1), 4740);
assert.equal(avancado.precoCentavos - descontoIndicacao(avancado, "mensal", 5), 7590);
assert.equal(descontoIndicacao(essencial, "mensal", 0), 0);
// anual: com 12 meses de saldo, 5% sobre a anuidade inteira
assert.equal(essencial.precoAnualCentavos - descontoIndicacao(essencial, "anual", 12), 18905);
assert.equal(profissional.precoAnualCentavos - descontoIndicacao(profissional, "anual", 12), 47405);
assert.equal(avancado.precoAnualCentavos - descontoIndicacao(avancado, "anual", 12), 75905);
assert.equal(descontoIndicacao(essencial, "anual", 11), 912); // pagou 1 mês antes: 5% sobre 11/12
assert.equal(descontoIndicacao(essencial, "anual", 30), 995); // nunca mais que a anuidade

// indicada: 12 meses desde o cadastro, gastos pelos pagamentos
assert.equal(saldoDeMeses([d("2026-10-01")], []), 12);
assert.equal(saldoDeMeses([d("2026-10-01")], meses(0, 2)), 10);
assert.equal(saldoDeMeses([d("2026-10-01")], meses(0, 13)), 0);
assert.equal(saldoDeMeses([d("2026-10-01")], [pg("2026-11-01", "anual")]), 0);
// quem indicou: crédito na data do prêmio; o que pagou antes não gasta
assert.equal(saldoDeMeses([d("2026-12-15")], meses(0, 2)), 12);
assert.equal(saldoDeMeses([d("2026-12-15")], meses(0, 3)), 11);
// as duas pontas e duas indicações: os meses se somam
assert.equal(saldoDeMeses([d("2026-10-01"), d("2026-11-15"), d("2026-11-20")], meses(0, 1)), 35);
// prêmio na mesma hora do pagamento: o crédito vem antes
assert.equal(saldoDeMeses([d("2026-11-01")], [pg("2026-11-01")]), 11);
