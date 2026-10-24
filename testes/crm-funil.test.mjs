// Funil, campanhas e mensagens do CRM (puras). Rodar com: npm run testar
import assert from "node:assert/strict";
import { centavosDito, descreveFiltro, filtraClientes, filtroLimpo, linkZap, preenche, resumoDoFunil, validaCampanha, validaOportunidade } from "../lib/crm-funil.ts";

assert.equal(centavosDito("1.234,56"), 123456);
assert.equal(centavosDito("R$ 300"), 30000);
assert.equal(centavosDito(""), 0);
assert.ok(Number.isNaN(centavosDito("abc")));

assert.ok("erro" in validaOportunidade({ titulo: "", contatoNome: "Ana" }));
assert.ok("erro" in validaOportunidade({ titulo: "Vestido", contatoNome: "" }));
assert.ok("erro" in validaOportunidade({ titulo: "Vestido", contatoNome: "Ana", contatoWhatsapp: "123" }));
const v = validaOportunidade({ titulo: " 3 vestidos  de festa ", contatoNome: "Ana", contatoWhatsapp: "(34) 99876-5432", valor: "450,00", etapa: "negociacao", origem: "instagram" });
assert.deepEqual(v, { ok: { titulo: "3 vestidos de festa", clienteId: null, contatoNome: "Ana", contatoWhatsapp: "5534998765432", valorCentavos: 45000, etapa: "negociacao", origem: "instagram", proximaAcao: null, proximaData: null } });
assert.equal(validaOportunidade({ titulo: "x", contatoNome: "Ana", etapa: "ganho" }).ok.etapa, "contato"); // ganhar é pelo botão, não pelo formulário

const d = (s) => new Date(`${s}T15:00:00Z`);
const r = resumoDoFunil(
  [
    { etapa: "contato", valorCentavos: 10000, origem: null, motivoPerda: null, criadoEm: d("2026-10-01"), fechadoEm: null, proximaData: "2026-10-20" },
    { etapa: "negociacao", valorCentavos: 20000, origem: "instagram", motivoPerda: null, criadoEm: d("2026-10-01"), fechadoEm: null, proximaData: null },
    { etapa: "ganho", valorCentavos: 30000, origem: "instagram", motivoPerda: null, criadoEm: d("2026-10-01"), fechadoEm: d("2026-10-11"), proximaData: null },
    { etapa: "perdido", valorCentavos: 5000, origem: "indicacao", motivoPerda: "preco", criadoEm: d("2026-10-01"), fechadoEm: d("2026-10-05"), proximaData: null },
    { etapa: "ganho", valorCentavos: 99999, origem: null, motivoPerda: null, criadoEm: d("2026-01-01"), fechadoEm: d("2026-02-01"), proximaData: null },
  ],
  { de: "2026-07-26", ate: "2026-10-24", hoje: "2026-10-24" },
);
assert.equal(r.abertas, 2);
assert.equal(r.valorAberto, 30000);
assert.equal(r.previsto, 1000 + 14000);
assert.equal(r.ganhas, 1);
assert.equal(r.conversao, 50);
assert.equal(r.diasAteFechar, 10);
assert.equal(r.atrasadas, 1);
assert.deepEqual(r.motivos, { preco: 1 });
assert.equal(r.porOrigem.instagram.ganhas, 1);

assert.deepEqual(filtroLimpo({ segmento: "sumindo", etiqueta: " Jeans ", maiores: "1", lixo: "x", aniversario: "0" }), { segmento: "sumindo", etiqueta: "jeans", maiores: true });
const cs = [
  { id: "a", segmento: "sumindo", etiquetas: ["jeans"], cidade: "Uberlândia", maior: true, aniversarioEm: null },
  { id: "b", segmento: "fiel", etiquetas: [], cidade: "uberlandia", maior: false, aniversarioEm: 3 },
];
assert.deepEqual(filtraClientes(cs, { cidade: "UBERLANDIA" }).map((c) => c.id), ["a", "b"]);
assert.deepEqual(filtraClientes(cs, { aniversario: true }).map((c) => c.id), ["b"]);
assert.deepEqual(filtraClientes(cs, { categoria: "Saias" }, new Map([["b", ["saias"]]])).map((c) => c.id), ["b"]);
assert.equal(descreveFiltro({}), "Todos os clientes próprios");
assert.ok("erro" in validaCampanha({ nome: "x", mensagem: "oi" }));
assert.equal(validaCampanha({ nome: "Inverno", mensagem: "Oi {nome}, chegou casaco!", tipo: "x" }).ok.tipo, "oferta");

assert.equal(preenche("Oi {nome}, aqui é da {empresa}. {nada}Tchau", { nome: "Maria Silva", empresa: "Brechó Bom" }), "Oi Maria, aqui é da Brechó Bom. Tchau");
assert.equal(linkZap(null, "oi"), null);
assert.equal(linkZap("5534998765432", "oi você"), "https://wa.me/5534998765432?text=oi%20voc%C3%AA");
console.log("crm-funil: ok");
