// Monta public/site.html (servido pela Vercel em "/", ver next.config.ts) a partir do protótipo (que é um trecho de página para o visualizador de
// artefatos) envolvendo-o num documento HTML completo. Rodar: node scripts/montar-site.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const trecho = readFileSync(new URL("../plist-prototipo.html", import.meta.url), "utf8");

// O <title>, as fontes e os scripts do trecho ficam no <body>; o navegador aceita e o arquivo
// continua igual ao do artefato. No <head> só o que precisa vir antes.
const favicon = "data:image/svg+xml;base64," + Buffer.from(
  readFileSync(new URL("../marca/plist-favicon.svg", import.meta.url), "utf8").replace(/<metadata>[\s\S]*?<\/metadata>/, "")
).toString("base64");

const pagina = [
  "<!doctype html>",
  '<html lang="pt-BR">',
  "<head>",
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  // Protótipo com dados de exemplo: fora dos buscadores até nome/INPI estarem definidos.
  '<meta name="robots" content="noindex, nofollow">',
  // O visualizador de artefatos já traz essa base; sem ela, .modal{display:grid} vence o atributo hidden.
  '<link rel="icon" type="image/svg+xml" href="' + favicon + '">',
  "<style>[hidden]{display:none!important}body{margin:0}</style>",
  // Guarda o #seção do link antes que o protótipo troque o endereço para #site.
  "<script>window.secaoDoLink = decodeURIComponent(location.hash.slice(1));</script>",
  "</head>",
  "<body>",
  trecho.trim(),
  // No site de verdade, Entrar e Começar grátis levam ao cadastro e ao login reais do app (/entrar,
  // /cadastro). Pega o clique antes do protótipo, que no artefato continua simulando tudo.
  "<script>",
  "document.addEventListener('click', function (e) {",
  "  var b = e.target.closest && e.target.closest('[data-start], [data-go=\"login\"]');",
  "  if (!b) return;",
  "  e.preventDefault(); e.stopImmediatePropagation();",
  "  location.href = b.dataset.start ? '/cadastro?plano=' + encodeURIComponent(b.dataset.start) : '/entrar';",
  "}, true);",
  // Link direto para uma seção: plist.com.br/#planos (ou #s-planos) rola até ela ao abrir.
  "window.addEventListener('load', function () {",
  "  var h = window.secaoDoLink;",
  "  var s = h && (document.getElementById('s-' + h) || document.getElementById(h));",
  "  if (s) s.scrollIntoView();",
  "});",
  "</script>",
  "</body>",
  "</html>",
  "",
].join("\n");

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/site.html", import.meta.url), pagina);
console.log("public/site.html gerado (" + pagina.length + " bytes)");
