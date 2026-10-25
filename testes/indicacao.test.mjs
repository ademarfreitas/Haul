// Desconto de indicação (5% em 3 meses para as duas pontas). Rodar com: npm run testar
import assert from "node:assert/strict";
import { PLANOS, descontoIndicacao, saldoDeMeses } from "../lib/planos.ts";

const [essencial, profissional, avancado] = PLANOS;
const d = (s) => new Date(`${s}T12:00:00Z`);
const pg = (s, ciclo = "mensal") => ({ pagaEm: d(s), ciclo });

// mensal: 5% enquanto houver saldo
assert.equal(essencial.precoCentavos - descontoIndicacao(essencial, "mensal", 3), 1890);
assert.equal(profissional.precoCentavos - descontoIndicacao(profissional, "mensal", 1), 4740);
assert.equal(avancado.precoCentavos - descontoIndicacao(avancado, "mensal", 2), 7590);
assert.equal(descontoIndicacao(essencial, "mensal", 0), 0);
// anual: 5% sobre os meses do saldo (3 de 12)
assert.equal(descontoIndicacao(essencial, "anual", 3), 249);
assert.equal(descontoIndicacao(profissional, "anual", 3), 624);
assert.equal(descontoIndicacao(avancado, "anual", 3), 999);
assert.equal(descontoIndicacao(essencial, "anual", 2), 166);
assert.equal(descontoIndicacao(essencial, "anual", 20), 995); // nunca mais que 12 meses

// indicada: 3 meses desde o cadastro, gastos pelos pagamentos
assert.equal(saldoDeMeses([d("2026-10-01")], []), 3);
assert.equal(saldoDeMeses([d("2026-10-01")], [pg("2026-11-01"), pg("2026-12-01")]), 1);
assert.equal(saldoDeMeses([d("2026-10-01")], [pg("2026-11-01", "anual")]), 0);
// quem indicou: crédito na data do prêmio; o que pagou antes não gasta
assert.equal(saldoDeMeses([d("2026-12-15")], [pg("2026-11-01"), pg("2026-12-01")]), 3);
assert.equal(saldoDeMeses([d("2026-12-15")], [pg("2026-11-01"), pg("2027-01-01")]), 2);
// as duas pontas e duas indicações: os meses se somam
assert.equal(saldoDeMeses([d("2026-10-01"), d("2026-11-15"), d("2026-11-20")], [pg("2026-11-01")]), 8);
// prêmio na mesma hora do pagamento: o crédito vem antes
assert.equal(saldoDeMeses([d("2026-11-01")], [pg("2026-11-01")]), 2);
