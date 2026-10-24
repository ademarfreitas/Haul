import { clientesComMedidas, contaComCrm } from "@/lib/crm";
import { SEGMENTOS } from "@/lib/crm-medidas";
import { CANAIS } from "@/lib/canais";

export const dynamic = "force-dynamic";

// Planilha dos clientes do CRM (abre no Excel: ponto e vírgula e BOM).
export async function GET() {
  const atual = await contaComCrm();
  if (!atual) return new Response("O CRM é do plano Avançado.", { status: 403 });
  const { clientes } = await clientesComMedidas(atual.conta.id);
  // aspas e fórmulas: nada que comece com = + - @ vira fórmula no Excel
  const cel = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const linhas = [
    ["Nome", "Canal", "Segmento", "Pedidos", "Total (R$)", "Primeira compra", "Última compra", "Próxima esperada", "Cidade", "UF", "WhatsApp", "E-mail", "Aceita ofertas", "Etiquetas"],
    ...clientes.map((c) => [
      c.nome,
      c.canal ? CANAIS[c.canal].nome : "Cliente próprio",
      SEGMENTOS[c.segmento].um,
      c.compras,
      (c.totalCentavos / 100).toFixed(2).replace(".", ","),
      c.primeira,
      c.ultima,
      c.proxima,
      c.cidade,
      c.uf,
      c.whatsapp,
      c.email,
      c.ofertas ? "sim" : "não",
      c.etiquetas.join(", "),
    ]),
  ];
  const csv = "﻿" + linhas.map((l) => l.map(cel).join(";")).join("\r\n");
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="clientes-plist.csv"', "cache-control": "no-store" },
  });
}
