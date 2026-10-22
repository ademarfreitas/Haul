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
  "</head>",
  "<body>",
  trecho.trim(),
  "</body>",
  "</html>",
  "",
].join("\n");

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/site.html", import.meta.url), pagina);
console.log("public/site.html gerado (" + pagina.length + " bytes)");
