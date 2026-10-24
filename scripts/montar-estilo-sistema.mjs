// Gera app/(sistema)/sistema.css a partir do <style> do protótipo, para o sistema real ficar com a
// mesma cara. Tira o que é do site público e da primeira entrada, e prende o resto dentro de .app
// (as telas de acesso usam app/estilo.css e não podem mudar). Rodar depois de mexer no protótipo:
//   node scripts/montar-estilo-sistema.mjs
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync(new URL("../plist-prototipo.html", import.meta.url), "utf8");
const inicio = html.indexOf("<style>") + "<style>".length;
const css = html.slice(inicio, html.indexOf("</style>", inicio));

const linhas = css.split("\n");
const fora = (l) =>
  /^\s*\.x-|^\s*#s[A-Z]|siteview|#v-site|firstrun|^\s*\.frtop|^\s*\.signup|^\s*\.backsite|:root\[data-theme="dark"\]/.test(l);

// o bloco :root[data-theme="dark"]{...} ocupa várias linhas: pula até o "}" que fecha
const saida = [];
let pulando = false;
for (const l of linhas) {
  if (pulando) {
    if (l.trim() === "}") pulando = false;
    continue;
  }
  if (l.startsWith(':root[data-theme="dark"]{')) {
    pulando = true;
    continue;
  }
  if (fora(l)) continue;
  saida.push(l);
}

let r = saida.join("\n");
const trocar = (a, b) => {
  if (!r.includes(a)) throw new Error(`não achei no protótipo: ${a}`);
  r = r.split(a).join(b);
};
trocar(":root{", ".app{");
trocar('@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){', "@media (prefers-color-scheme: dark){.app{");
trocar("*{box-sizing:border-box}\n", "");
trocar("html,body{height:100%}\n", "");
trocar("body{background:var(--bg);", ".app{background:var(--bg);");
trocar("h1,h2,h3{", ".app :is(h1,h2,h3){");
trocar("\nh1{", "\n.app h1{");
trocar("\nh2{", "\n.app h2{");
trocar("\nh3{", "\n.app h3{");
trocar("\np{margin:0}", "\n.app p{margin:0}");
trocar("button,input,select,textarea{", ".app :is(button,input,select,textarea){");
trocar("\n:focus-visible{", "\n.app :focus-visible{");
trocar("\ntable{", "\n.app table{");
trocar("\nth,td{", "\n.app :is(th,td){");
trocar("\nth{", "\n.app th{");
trocar("\ntr:last-child td{", "\n.app tr:last-child td{");
trocar("  h1{font-size:1.45rem}", "  .app h1{font-size:1.45rem}");

// app/estilo.css limita <main> a 720px para as telas de acesso; aqui a área é larga
r += "\n.app{min-height:100vh}\n.app>main.main{max-width:none;margin:0}\n.app a{color:inherit}\n.app :is(a.btn,a.chip,a.nav,a.brand,a.trialchip){text-decoration:none}\n";

// Canais: a conta conectada vira um bloco dentro do card; o nome longo encolhe em vez de empurrar o selo
// para fora, e o botão principal desce para o pé, alinhado com o dos outros cards da mesma linha
r += ".cc .conta{border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:grid;grid-template-columns:minmax(0,1fr);gap:8px}\n" +
  ".cc .conta .top b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n" +
  ".cc .conta .top .pill{flex:none}\n" +
  ".cc .conta .actions{justify-content:flex-end}\n" +
  ".cc>.btn.primary{margin-top:auto;justify-content:center}\n";

const abre = r.split("{").length;
const fecha = r.split("}").length;
if (abre !== fecha) throw new Error(`chaves desequilibradas: ${abre - 1} "{" e ${fecha - 1} "}"`);

const destino = new URL("../app/(sistema)/sistema.css", import.meta.url);
writeFileSync(destino, `/* Gerado por scripts/montar-estilo-sistema.mjs a partir de plist-prototipo.html. Não editar à mão. */\n${r.trim()}\n`);
console.log(`sistema.css: ${r.length} caracteres`);
