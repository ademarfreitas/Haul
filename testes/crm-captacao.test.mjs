// Página de cadastro da loja (puras). Rodar com: npm run testar
import assert from "node:assert/strict";
import { codigoValido, completa, cupomValido, DE, deValido, novoCodigo, validaCadastro } from "../lib/crm-captacao.ts";

// código: 7 letras sem as que se confundem
const c = novoCodigo();
assert.ok(codigoValido(c), c);
assert.ok(!/[01ilo]/.test(c));
assert.equal(novoCodigo(() => 0), "aaaaaaa");
assert.ok(!codigoValido("abc"));
assert.ok(!codigoValido("ABCDEFG"));
assert.ok(!codigoValido("abc/def"));

// origem: tudo que não é "pacote" é a página da loja; o pacote nunca mostra cupom
assert.equal(deValido("pacote"), "pacote");
assert.equal(deValido("x"), "loja");
assert.equal(deValido(undefined), "loja");
assert.equal(DE.pacote.cupom, false);
assert.equal(DE.loja.cupom, true);

assert.deepEqual(cupomValido(" bemvinda10 "), { ok: "BEMVINDA10" });
assert.deepEqual(cupomValido(""), { ok: null });
assert.ok("erro" in cupomValido("com espaço"));
assert.ok("erro" in cupomValido("ab"));

const base = { nome: "  Ana   Souza ", whatsapp: "(34) 99876-5432", aceite: "on" };
assert.deepEqual(validaCadastro(base), { ok: { nome: "Ana Souza", whatsapp: "5534998765432", email: null, aniversario: null, pedido: null } });
assert.equal(validaCadastro({ ...base, aceite: undefined }).erro, "Marque que aceita receber novidades para se cadastrar.");
assert.ok("erro" in validaCadastro({ ...base, whatsapp: "1234" }));
assert.ok("erro" in validaCadastro({ ...base, nome: "A" }));
assert.ok("erro" in validaCadastro({ ...base, email: "ana@" }));
assert.ok("erro" in validaCadastro({ ...base, aniversario: "31/12" }));
const cheio = validaCadastro({ ...base, email: "Ana@Ex.com", aniversario: "1990-03-15", pedido: " 2000-0123#4 " });
assert.deepEqual(cheio.ok, { nome: "Ana Souza", whatsapp: "5534998765432", email: "ana@ex.com", aniversario: "1990-03-15", pedido: "2000-01234" });

// cliente que já existe: só preenche o vazio
assert.deepEqual(completa({ whatsapp: null, email: "velho@ex.com", aniversario: null }, cheio.ok), { whatsapp: "5534998765432", email: "velho@ex.com", aniversario: "1990-03-15" });
assert.deepEqual(completa({ whatsapp: "5511912345678", email: null, aniversario: null }, cheio.ok).whatsapp, "5511912345678");

console.log("crm-captacao ok");
