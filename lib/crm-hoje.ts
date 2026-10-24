// "Quem chamar hoje": as ações do dia do CRM, cada uma com a mensagem pronta. WhatsApp só para cliente
// próprio com número; o comprador de marketplace aparece para o lojista falar pela conversa do pedido no canal.
import { and, eq, gte, inArray, isNotNull, lte, notInArray, or, sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { clientes, oportunidades, pecas, pedidos } from "@/db/schema";
import { clienteProprio, NAO_CONTA, type clientesComMedidas } from "@/lib/crm";
import { ABERTAS, linkZap, MODELOS, preenche } from "@/lib/crm-funil";
import { diaSP, somaDias } from "@/lib/crm-medidas";

type Medidas = Awaited<ReturnType<typeof clientesComMedidas>>;
type Cliente = Medidas["clientes"][number];

export type Acao = {
  id: string; // cliente
  nome: string;
  detalhe: string;
  msg: string;
  zap: string | null;
  semZap: string | null; // por que não tem o botão
  totalCentavos: number;
};

export async function acoesDoDia(contaId: string, medidas: Medidas, empresa: string) {
  const hoje = diaSP(new Date());
  const item = (c: Cliente, tipo: keyof typeof MODELOS, detalhe: string, extra: Record<string, string> = {}): Acao => {
    const msg = preenche(MODELOS[tipo], { nome: c.nome, empresa, ...extra });
    const proprio = clienteProprio(c);
    return {
      id: c.id,
      nome: c.nome,
      detalhe,
      msg,
      zap: proprio ? linkZap(c.whatsapp, msg) : null,
      semZap: proprio ? (c.whatsapp ? null : "sem WhatsApp") : "fale pela conversa do pedido no canal",
      totalCentavos: c.totalCentavos,
    };
  };
  const reais = (v: number) => (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const ritmo = (c: Cliente) => (c.ritmo ? ` · costuma voltar a cada ${c.ritmo} dias` : "");
  const todos = medidas.clientes;

  const contatos = todos
    .filter((c) => c.proximoContato && c.proximoContato <= hoje)
    .sort((a, b) => a.proximoContato!.localeCompare(b.proximoContato!))
    .map((c) => item(c, "contato", `${c.proximoContato! < hoje ? "atrasado · " : ""}${c.proximoPasso ?? "contato marcado"}`));
  const aniversarios = todos
    .filter((c) => c.aniversarioEm !== null && c.aniversarioEm <= 7)
    .sort((a, b) => a.aniversarioEm! - b.aniversarioEm!)
    .map((c) => item(c, "aniversario", c.aniversarioEm === 0 ? "faz aniversário hoje" : `aniversário em ${c.aniversarioEm} ${c.aniversarioEm === 1 ? "dia" : "dias"}`));
  const sumindo = todos
    .filter((c) => c.segmento === "sumindo")
    .sort((a, b) => b.totalCentavos - a.totalCentavos)
    .slice(0, 12)
    .map((c) => item(c, "sumindo", `sem comprar há ${c.parado} dias${ritmo(c)} · já comprou ${reais(c.totalCentavos)}`));
  const perdidos = todos
    .filter((c) => c.segmento === "perdido" && (c.parado ?? 0) <= 365 && c.compras >= 2)
    .sort((a, b) => b.totalCentavos - a.totalCentavos)
    .slice(0, 8)
    .map((c) => item(c, "perdido", `sem comprar há ${c.parado} dias · já comprou ${reais(c.totalCentavos)}`));
  const novos = todos
    .filter((c) => c.segmento === "novo" && (c.parado ?? 0) >= 2 && (c.parado ?? 0) <= 20)
    .sort((a, b) => (a.parado ?? 0) - (b.parado ?? 0))
    .slice(0, 10)
    .map((c) => item(c, "novo", `1ª compra há ${c.parado} dias: pós-venda`));

  const db = obterDb();
  const cincoDias = new Date(Date.now() - 5 * 86_400_000);
  const [ops, chegadas, perfis] = await Promise.all([
    db
      .select({
        id: oportunidades.id,
        numero: oportunidades.numero,
        titulo: oportunidades.titulo,
        valorCentavos: oportunidades.valorCentavos,
        etapa: oportunidades.etapa,
        proximaAcao: oportunidades.proximaAcao,
        proximaData: oportunidades.proximaData,
        nome: sql<string>`coalesce(${clientes.nome}, ${oportunidades.contatoNome})`,
      })
      .from(oportunidades)
      .leftJoin(clientes, eq(clientes.id, oportunidades.clienteId))
      .where(
        and(
          eq(oportunidades.contaId, contaId),
          inArray(oportunidades.etapa, [...ABERTAS]),
          or(lte(oportunidades.proximaData, hoje), and(sql`${oportunidades.proximaData} is null`, lte(oportunidades.etapaDesde, cincoDias))),
        ),
      )
      .orderBy(sql`${oportunidades.proximaData} nulls first`)
      .limit(20),
    // chegou peça: o que entrou à venda nos últimos 7 dias
    db
      .select({ id: pecas.id, titulo: pecas.titulo, categoria: pecas.categoria, marca: pecas.marca, tamanho: pecas.tamanho })
      .from(pecas)
      .where(and(eq(pecas.contaId, contaId), eq(pecas.situacao, "disponivel"), gte(pecas.criadoEm, new Date(`${somaDias(hoje, -7)}T03:00:00Z`)), isNotNull(pecas.categoria)))
      .limit(40),
    db
      .select({ clienteId: pedidos.clienteId, categoria: pecas.categoria, marca: pecas.marca, tamanho: pecas.tamanho })
      .from(pedidos)
      .innerJoin(pecas, eq(pecas.id, pedidos.pecaId))
      .where(and(eq(pedidos.contaId, contaId), isNotNull(pedidos.clienteId), notInArray(pedidos.situacao, [...NAO_CONTA])))
      .limit(20_000),
  ]);

  const oportunidadesDoDia = ops.map((o) => ({ ...o, atrasada: !!o.proximaData && o.proximaData < hoje }));

  // brechó: cada peça é única, então "quem costuma comprar" é quem leva a mesma categoria e a mesma marca ou tamanho
  const porId = new Map(todos.map((c) => [c.id, c]));
  const chegou = chegadas
    .map((p) => {
      const ids = new Set(
        perfis
          .filter((x) => x.categoria === p.categoria && ((p.marca && x.marca === p.marca) || (p.tamanho && x.tamanho === p.tamanho)))
          .map((x) => x.clienteId!),
      );
      const lista = [...ids]
        .map((id) => porId.get(id))
        .filter((c): c is Cliente => !!c)
        .sort((a, b) => b.totalCentavos - a.totalCentavos)
        .slice(0, 15)
        .map((c) => item(c, "chegou", `costuma levar ${[p.categoria, p.marca, p.tamanho].filter(Boolean).join(", ")}`, { produto: p.titulo }));
      return { pecaId: p.id, titulo: p.titulo, clientes: lista };
    })
    .filter((x) => x.clientes.length)
    .slice(0, 10);

  const total =
    contatos.length + oportunidadesDoDia.length + aniversarios.length + sumindo.length + perdidos.length + novos.length + chegou.reduce((s, x) => s + x.clientes.length, 0);
  return { contatos, oportunidades: oportunidadesDoDia, aniversarios, sumindo, perdidos, novos, chegou, total };
}
