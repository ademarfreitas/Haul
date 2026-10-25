// Desconto de quem entra por indicação (5% nos 3 primeiros meses). Rodar com: npm run testar
import assert from "node:assert/strict";
import { PLANOS, descontoIndicacao } from "../lib/planos.ts";

const [essencial, profissional, avancado] = PLANOS;
// mensal: 5% nas 3 primeiras mensalidades, depois nada
assert.equal(essencial.precoCentavos - descontoIndicacao(essencial, "mensal", 0), 1890);
assert.equal(profissional.precoCentavos - descontoIndicacao(profissional, "mensal", 1), 4740);
assert.equal(avancado.precoCentavos - descontoIndicacao(avancado, "mensal", 2), 7590);
assert.equal(descontoIndicacao(essencial, "mensal", 3), 0);
// anual: 5% sobre 3 dos 12 meses da primeira anuidade
assert.equal(descontoIndicacao(essencial, "anual", 0), 249);
assert.equal(descontoIndicacao(profissional, "anual", 0), 624);
assert.equal(descontoIndicacao(avancado, "anual", 0), 999);
// pagou 1 mês e passou para o anual: sobram 2 meses de desconto
assert.equal(descontoIndicacao(essencial, "anual", 1), 166);
assert.equal(descontoIndicacao(essencial, "anual", 12), 0);
