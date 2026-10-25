// Nota fiscal e planilha do fornecedor, e os textos de aviso. Rodar com: npm run testar
import assert from "node:assert/strict";
import { adivinharColunas, centavosBr, conferirItens, itensDaPlanilha, lerCsv, lerNfe } from "../lib/fornecedor-arquivo.ts";
import { avisoDeCusto, avisoDeEstoque, emailDeAvisos } from "../lib/avisos-texto.ts";

// ---------- NF-e (com o envelope nfeProc e namespace, como chega do fornecedor) ----------
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe35261012345678000199550010000012341000012345" versao="4.00">
<ide><cUF>35</cUF><nNF>1234</nNF></ide>
<emit><CNPJ>12345678000199</CNPJ><xNome>DISTRIBUIDORA BOA COMPRA LTDA</xNome><xFant>Boa Compra</xFant><enderEmit><xLgr>Rua A</xLgr></enderEmit></emit>
<dest><CNPJ>99999999000100</CNPJ><xNome>Loja da Ana</xNome></dest>
<det nItem="1"><prod><cProd>CAM-001</cProd><cEAN>7891234567895</cEAN><xProd>CAMISETA BASICA ALGODAO P &amp; M</xProd><NCM>61091000</NCM><uCom>UN</uCom><qCom>10.0000</qCom><vUnCom>18.5000000000</vUnCom><cEANTrib>7891234567895</cEANTrib></prod><imposto></imposto></det>
<det nItem="2"><prod><cProd>MEIA-02</cProd><cEAN>SEM GTIN</cEAN><xProd>MEIA CANO ALTO</xProd><qCom>24.0000</qCom><vUnCom>3.20</vUnCom><cEANTrib>SEM GTIN</cEANTrib></prod></det>
<detPag><tPag>15</tPag></detPag>
</infNFe></NFe><protNFe/></nfeProc>`;
const nota = lerNfe(xml);
assert.equal(nota.chave, "35261012345678000199550010000012341000012345");
assert.equal(nota.numero, "1234");
assert.deepEqual(nota.fornecedor, { nome: "Boa Compra", documento: "12345678000199" });
assert.equal(nota.itens.length, 2);
assert.deepEqual(nota.itens[0], { codigo: "CAM-001", ean: "7891234567895", titulo: "CAMISETA BASICA ALGODAO P & M", marca: "", quantidade: 10, custoCentavos: 1850, precoCentavos: null });
assert.equal(nota.itens[1].ean, "");
assert.equal(nota.itens[1].custoCentavos, 320);
assert.equal(lerNfe("<html></html>"), null);

// ---------- planilha (Excel brasileiro: ponto e vírgula, vírgula decimal, aspas) ----------
const csv = '﻿Código;Descrição do produto;EAN;Qtde;Preço de custo;Preço de venda;Marca\r\n' +
  'A1;"Garrafa térmica 1L ""inox""";7891000100103;5;R$ 32,90;69,90;Termo\r\n' +
  'A2;Copo;;2;1.234,50;;\r\n' +
  ';;;;;;\r\n' +
  'A3;X;;1;1;2;\r\n';
const p = lerCsv(csv);
assert.deepEqual(p.colunas, ["Código", "Descrição do produto", "EAN", "Qtde", "Preço de custo", "Preço de venda", "Marca"]);
assert.equal(p.linhas.length, 3); // a linha vazia some
const mapa = adivinharColunas(p.colunas);
assert.deepEqual(mapa, { ean: "EAN", custo: "Preço de custo", preco: "Preço de venda", quantidade: "Qtde", codigo: "Código", marca: "Marca", titulo: "Descrição do produto" });
const itens = itensDaPlanilha(p.colunas, p.linhas, mapa);
assert.equal(itens.length, 2); // "X" tem nome curto demais
assert.deepEqual(itens[0], { codigo: "A1", ean: "7891000100103", titulo: 'Garrafa térmica 1L "inox"', marca: "Termo", quantidade: 5, custoCentavos: 3290, precoCentavos: 6990 });
assert.equal(itens[1].custoCentavos, 123450);
assert.equal(itens[1].precoCentavos, null);
// "código de barras" é EAN, não o código do produto
assert.deepEqual(adivinharColunas(["Código de barras", "Cód. produto", "Nome"]), { ean: "Código de barras", codigo: "Cód. produto", titulo: "Nome" });
// vírgula como separador
assert.deepEqual(lerCsv("sku,nome,estoque\n1,Bolsa,3\n").linhas, [["1", "Bolsa", "3"]]);

assert.equal(centavosBr("10,9"), 1090);
assert.equal(centavosBr("1234.56"), 123456);
assert.equal(centavosBr("1.500"), 150000);
assert.equal(centavosBr("abc"), null);

// o servidor confere de novo o que veio do navegador
assert.deepEqual(conferirItens([{ titulo: "  Bolsa   couro ", quantidade: -3, custoCentavos: "10", ean: "123" }, { titulo: "x" }, null]), [
  { codigo: "", ean: "", titulo: "Bolsa couro", marca: "", quantidade: 0, custoCentavos: null, precoCentavos: null },
]);
assert.equal(conferirItens("lixo").length, 0);

// ---------- avisos ----------
const custo = avisoDeCusto({ titulo: "Garrafa térmica", antes: 3000, depois: 3290, origem: "nota 1234 de Boa Compra", anuncios: [{ canal: "Mercado Livre", precoCentavos: 6990, taxaCentavos: 1188 }] });
assert.equal(custo.titulo, "Custo subiu: Garrafa térmica");
assert.match(custo.detalhe, /de R\$\s30,00 para R\$\s32,90 \(nota 1234 de Boa Compra\)/);
assert.match(custo.detalhe, /sobram R\$\s25,12/);
assert.match(custo.detalhe, /cerca de R\$\s72,80/);
assert.match(avisoDeCusto({ titulo: "X", antes: 100, depois: 200, origem: "planilha", anuncios: [] }).detalhe, /ainda não está anunciada/);
assert.equal(avisoDeEstoque({ titulo: "Meia", quantidade: 0, minimo: 3 }).titulo, "Acabou: Meia");
assert.match(avisoDeEstoque({ titulo: "Meia", quantidade: 1, minimo: 3 }).detalhe, /Sobrou|Sobraram 1 unidade/);
const email = emailDeAvisos([custo, { titulo: "<b>", detalhe: "a\nb" }], "https://app.plist.com.br/tarefas");
assert.equal(email.assunto, "Plist: 2 avisos de custo e estoque");
assert.ok(email.html.includes("&lt;b&gt;") && email.html.includes("a<br>b"));

console.log("fornecedor: ok");
