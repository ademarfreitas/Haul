// Medidas do CRM (puras). Rodar com: npm run testar
import assert from "node:assert/strict";
import { classifica, diasParaAniversario, etiquetaValida, mede, ritmoDe, ritmoDaLoja } from "../lib/crm-medidas.ts";
const h = "2026-10-24";
assert.equal(ritmoDe({ primeira: "2026-01-01", ultima: "2026-01-31", dias: 3 }), 15);
assert.equal(ritmoDe({ primeira: "2026-01-01", ultima: "2026-01-01", dias: 1 }), null);
assert.equal(ritmoDaLoja([10, 20]), 30);
assert.equal(ritmoDaLoja([10, 20, 40]), 20);
assert.equal(classifica({ compras: 0, primeira: null, ultima: null, ritmo: null }, h), "nunca");
assert.equal(classifica({ compras: 1, primeira: "2026-10-10", ultima: "2026-10-10", ritmo: null }, h), "novo");
assert.equal(classifica({ compras: 1, primeira: "2026-07-01", ultima: "2026-07-01", ritmo: null }, h), "perdido");
assert.equal(classifica({ compras: 2, primeira: "2026-08-20", ultima: "2026-09-20", ritmo: 31 }, h), "ativo");
assert.equal(classifica({ compras: 2, primeira: "2026-08-01", ultima: "2026-09-01", ritmo: 10 }, h), "sumindo");
assert.equal(classifica({ compras: 4, primeira: "2026-07-01", ultima: "2026-10-20", ritmo: 25 }, h), "fiel");
assert.equal(diasParaAniversario("1990-10-24", h), 0);
assert.equal(diasParaAniversario("1990-10-23", h), 364);
assert.equal(diasParaAniversario("2000-02-29", "2027-02-27"), 1);
assert.deepEqual(etiquetaValida("  Jeans  Vintage "), { ok: "jeans vintage" });
assert.ok("erro" in etiquetaValida("evangélica"));
assert.ok("erro" in etiquetaValida("saúde"));
assert.deepEqual(etiquetaValida("transparente"), { ok: "transparente" });
assert.deepEqual(etiquetaValida("camisa negra"), { ok: "camisa negra" });
const { clientes } = mede([
  { compras: 5, totalCentavos: 50000, primeira: "2026-06-01", ultima: "2026-10-20", dias: 5, aniversario: null },
  { compras: 1, totalCentavos: 1000, primeira: "2026-10-01", ultima: "2026-10-01", dias: 1, aniversario: null },
  { compras: 0, totalCentavos: 0, primeira: null, ultima: null, dias: 0, aniversario: "1990-10-30" },
], h);
assert.equal(clientes[0].maior, true); assert.equal(clientes[1].maior, false);
assert.equal(clientes[1].ticketCentavos, 1000); assert.equal(clientes[2].aniversarioEm, 6); assert.equal(clientes[2].segmento, "nunca");
console.log("crm-medidas: ok");
