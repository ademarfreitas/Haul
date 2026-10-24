// Cria, uma vez só, o destino dos avisos de pedido da Amazon (a fila SQS do Plist) e mostra o destinationId,
// que vai em AMAZON_DESTINO_AVISOS. Passo a passo da fila em docs/amazon.md.
// Rodar: node scripts/amazon-destino-avisos.mjs arn:aws:sqs:us-east-1:123456789012:plist-pedidos-amazon
// Lê AMAZON_LWA_CLIENT_ID e AMAZON_LWA_CLIENT_SECRET do .env.local. Não mostra nenhum segredo.
import { existsSync } from "node:fs";

if (existsSync(new URL("../.env.local", import.meta.url))) process.loadEnvFile(new URL("../.env.local", import.meta.url));

const arn = process.argv[2] ?? "";
if (!/^arn:aws:sqs:\S+:\d+:\S+$/.test(arn)) {
  console.error("Passe o ARN da fila SQS: node scripts/amazon-destino-avisos.mjs arn:aws:sqs:REGIAO:CONTA:FILA");
  process.exit(1);
}
const { AMAZON_LWA_CLIENT_ID: id, AMAZON_LWA_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error("Faltam AMAZON_LWA_CLIENT_ID e AMAZON_LWA_CLIENT_SECRET no .env.local");
  process.exit(1);
}
const host = (process.env.AMAZON_API_URL || "https://sellingpartnerapi-na.amazon.com").replace(/\/+$/, "");

// criar destino não depende de vendedor: token "grantless" com o escopo de notificações
const t = await fetch("https://api.amazon.com/auth/o2/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
  body: new URLSearchParams({ grant_type: "client_credentials", scope: "sellingpartnerapi::notifications", client_id: id, client_secret: secret }),
}).then((r) => r.json());
if (!t.access_token) {
  console.error("A Amazon não deu o token:", t.error ?? "erro");
  process.exit(1);
}

const r = await fetch(`${host}/notifications/v1/destinations`, {
  method: "POST",
  headers: { "x-amz-access-token": t.access_token, "content-type": "application/json", "user-agent": "Plist/1.0 (Language=JavaScript)" },
  body: JSON.stringify({ name: "plist-pedidos", resourceSpecification: { sqs: { arn } } }),
});
const j = await r.json();
if (!r.ok) {
  console.error("A Amazon recusou:", j.errors?.[0]?.code, j.errors?.[0]?.message);
  console.error("Confira se a política da fila deixa a Amazon (conta 437568002678) mandar mensagens (sqs:SendMessage).");
  process.exit(1);
}
console.log("Destino criado. Coloque em AMAZON_DESTINO_AVISOS (no .env.local e na Vercel):");
console.log(j.payload.destinationId);
