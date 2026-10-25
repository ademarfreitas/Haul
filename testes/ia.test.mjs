// Limite e teto de custo da IA nos anúncios (R$ 2 a cada 50). Rodar com: npm run testar
import assert from "node:assert/strict";
import {
  IA_POR_MES,
  TETO_POR_ANUNCIO_MICRO,
  cortar,
  custoMaximoMicroReais,
  custoMicroReais,
  inicioDoMes,
  limparSugestao,
  situacaoIa,
} from "../lib/ia-limites.ts";

// um anúncio típico (3 fotos de 768 px + texto, resposta curta) custa menos de 1 centavo
assert.ok(custoMicroReais({ input_tokens: 4000, output_tokens: 800 }) < 10_000);
// o pior caso de uma chamada cabe no teto de R$ 0,04 por anúncio, então 50 anúncios ficam abaixo de R$ 2
assert.ok(custoMaximoMicroReais() <= TETO_POR_ANUNCIO_MICRO);
assert.ok(custoMaximoMicroReais() * 50 <= 2_000_000);

// limite por plano e no teste
assert.deepEqual(IA_POR_MES, { essencial: 5, profissional: 15, avancado: 50 });
assert.equal(situacaoIa({ plano: "essencial", emTeste: false }, 0, 0).restam, 5);
assert.equal(situacaoIa({ plano: null, emTeste: true }, 10, 0).restam, 40);
assert.equal(situacaoIa({ plano: null, emTeste: false }, 0, 0).pode, false);
const cheio = situacaoIa({ plano: "profissional", emTeste: false }, 15, 1000);
assert.equal(cheio.pode, false);
assert.match(cheio.motivo, /15 anúncios/);
// teto de custo: 5 anúncios × R$ 0,04 = R$ 0,20 no Essencial
assert.equal(situacaoIa({ plano: "essencial", emTeste: false }, 2, 200_000).pode, false);
assert.equal(situacaoIa({ plano: "essencial", emTeste: false }, 2, 199_999).pode, true);

// mês começa no dia 1º em Brasília
assert.equal(inicioDoMes(new Date("2026-11-01T02:00:00Z")).toISOString(), "2026-10-01T03:00:00.000Z");
assert.equal(inicioDoMes(new Date("2026-11-01T04:00:00Z")).toISOString(), "2026-11-01T03:00:00.000Z");

// títulos cortados na palavra, sem sobra de pontuação
assert.equal(cortar("Jaqueta jeans Levi's masculina azul tamanho M com bolsos frontais", 40), "Jaqueta jeans Levi's masculina azul");
assert.equal(cortar("  curto  ", 60), "curto");

// resposta da IA: tamanhos de cada canal, estado só dos valores conhecidos
const s = limparSugestao({
  tituloCurto: "x".repeat(80),
  titulo: "Vestido midi floral Farm viscose estampado manga curta tamanho M usado em ótimo estado com forro",
  descricao: "Vestido.",
  marca: "Farm",
  cor: "Estampado",
  tamanho: "M",
  condicao: "quase_novo",
  faltou: ["medidas", 3],
});
assert.equal(s.tituloCurto.length, 60);
assert.equal(s.condicao, "");
assert.deepEqual(s.faltou, ["medidas"]);
assert.equal(limparSugestao({ titulo: "" }), null);
assert.equal(limparSugestao("texto"), null);
// sem título curto, sai do título longo
assert.equal(limparSugestao({ titulo: "Tênis Nike Air Max 90 branco masculino 42 usado poucas vezes na caixa" }).tituloCurto, "Tênis Nike Air Max 90 branco masculino 42 usado poucas vezes");

console.log("ia: ok");
