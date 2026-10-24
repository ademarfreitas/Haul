// CRM do Plist (plano Avançado). Desenho e decisões em docs/crm.md.
import { sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import type { contas } from "@/db/schema";
import type { Canal } from "@/lib/canais";
import { contaAtual, diasDeTeste } from "@/lib/conta";
import { diaSP, mede } from "@/lib/crm-medidas";

type Conta = Pick<typeof contas.$inferSelect, "plano" | "situacaoAssinatura" | "testeAte">;

// No teste grátis tudo fica liberado (como diz Minha conta); depois, só no Avançado.
export function temCrm(conta: Conta): boolean {
  if (conta.situacaoAssinatura === "teste" && diasDeTeste(conta.testeAte) > 0) return true;
  return conta.plano === "avancado" && conta.situacaoAssinatura !== "cancelada";
}

// Canais em que o apelido do comprador é único e identifica a mesma pessoa de um pedido para outro.
// Nos outros (Magalu manda só o primeiro nome; Amazon e Shein, nada) o pedido ainda não vira cliente.
export const CANAIS_COM_APELIDO = ["mercado_livre", "shopee"] as const;

// Liga os pedidos novos aos clientes, criando o cliente de marketplace na primeira compra.
// Idempotente: só olha pedidos ainda sem cliente. Roda ao abrir o CRM.
export async function ligarPedidosAClientes(contaId: string) {
  const db = obterDb();
  const canais = sql.join(
    CANAIS_COM_APELIDO.map((c) => sql`${c}`),
    sql`, `,
  );
  await db.execute(sql`
    insert into clientes (conta_id, canal, chave_canal, nome, origem, cidade, uf)
    select distinct on (p.canal, lower(trim(p.comprador_nome)))
      p.conta_id, p.canal, lower(trim(p.comprador_nome)), trim(p.comprador_nome), 'marketplace', p.cidade, p.uf
    from pedidos p
    where p.conta_id = ${contaId} and p.cliente_id is null and p.canal in (${canais})
      and coalesce(trim(p.comprador_nome), '') <> ''
    order by p.canal, lower(trim(p.comprador_nome)), p.vendido_em desc
    on conflict (conta_id, canal, chave_canal) do nothing
  `);
  await db.execute(sql`
    update pedidos p set cliente_id = c.id
    from clientes c
    where p.conta_id = ${contaId} and p.cliente_id is null
      and c.conta_id = p.conta_id and c.canal = p.canal and c.chave_canal = lower(trim(p.comprador_nome))
  `);
}


// Os clientes da conta com as medidas (ritmo, segmento, próxima compra): a base de tudo do CRM.
export async function clientesComMedidas(contaId: string) {
  const { rows } = await obterDb().execute(sql`
    with a as (
      select cliente_id, count(*)::int as compras, sum(valor_venda_centavos)::int as total,
             min((vendido_em at time zone 'America/Sao_Paulo')::date)::text as primeira,
             max((vendido_em at time zone 'America/Sao_Paulo')::date)::text as ultima,
             count(distinct (vendido_em at time zone 'America/Sao_Paulo')::date)::int as dias
        from pedidos
       where conta_id = ${contaId} and cliente_id is not null and situacao not in (${sql.join(NAO_CONTA.map((s) => sql`${s}`), sql`, `)})
       group by cliente_id),
    e as (select cliente_id, array_agg(etiqueta order by etiqueta) as etiquetas from cliente_etiquetas where conta_id = ${contaId} group by cliente_id)
    select c.id, c.nome, c.canal, c.whatsapp, c.email, c.cidade, c.uf, c.origem, c.aniversario::text as aniversario,
           c.ofertas_aceite_em, c.proximo_contato::text as proximo_contato, c.proximo_passo,
           coalesce(a.compras, 0) as compras, coalesce(a.total, 0) as total, a.primeira, a.ultima, coalesce(a.dias, 0) as dias,
           coalesce(e.etiquetas, '{}') as etiquetas
      from clientes c left join a on a.cliente_id = c.id left join e on e.cliente_id = c.id
     where c.conta_id = ${contaId}
  `);
  const linhas = (rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    nome: r.nome as string,
    canal: r.canal as Canal | null,
    whatsapp: r.whatsapp as string | null,
    email: r.email as string | null,
    cidade: r.cidade as string | null,
    uf: r.uf as string | null,
    origem: r.origem as string | null,
    aniversario: r.aniversario as string | null,
    ofertas: r.ofertas_aceite_em != null,
    proximoContato: r.proximo_contato as string | null,
    proximoPasso: r.proximo_passo as string | null,
    etiquetas: r.etiquetas as string[],
    compras: Number(r.compras),
    totalCentavos: Number(r.total),
    primeira: r.primeira as string | null,
    ultima: r.ultima as string | null,
    dias: Number(r.dias),
  }));
  return mede(linhas, diaSP(new Date()));
}

// Pedidos que não contam como compra (para o CRM)
export const NAO_CONTA = ["cancelado", "devolvido", "aguardando_pagamento"] as const;

// O CRM só para quem tem acesso: usar no começo das ações (as páginas mostram a vitrine).
export async function contaComCrm() {
  const atual = await contaAtual();
  return atual && temCrm(atual.conta) ? atual : null;
}

// Cliente próprio é o que o lojista pode chamar direto (WhatsApp, campanhas): não veio de marketplace.
export function clienteProprio(c: { canal: Canal | null }) {
  return c.canal === null || c.canal === "venda_direta" || c.canal === "facebook";
}

// Categorias que cada cliente já comprou (filtro "compraram..." das campanhas).
export async function categoriasPorCliente(contaId: string) {
  const { rows } = await obterDb().execute(sql`
    select distinct p.cliente_id, pc.categoria
      from pedidos p join pecas pc on pc.id = p.peca_id
     where p.conta_id = ${contaId} and p.cliente_id is not null and pc.categoria is not null
       and p.situacao not in (${sql.join(NAO_CONTA.map((s) => sql`${s}`), sql`, `)})
  `);
  const mapa = new Map<string, string[]>();
  for (const r of rows as { cliente_id: string; categoria: string }[]) mapa.set(r.cliente_id, [...(mapa.get(r.cliente_id) ?? []), r.categoria]);
  return mapa;
}

// O retorno das campanhas: quantos receberam, quantos compraram até JANELA dias depois do envio e quanto.
export async function retornoDasCampanhas(contaId: string, janela: number) {
  const { rows } = await obterDb().execute(sql`
    select c.id, count(e.cliente_id)::int as enviados, count(distinct r.cliente_id)::int as compraram, coalesce(sum(r.total), 0)::int as vendido
      from campanhas c
      left join campanha_envios e on e.campanha_id = c.id
      left join lateral (
        select p.cliente_id, sum(p.valor_venda_centavos) as total from pedidos p
         where p.conta_id = c.conta_id and p.cliente_id = e.cliente_id
           and p.situacao not in (${sql.join(NAO_CONTA.map((s) => sql`${s}`), sql`, `)})
           and p.vendido_em >= e.enviado_em and p.vendido_em < e.enviado_em + make_interval(days => ${janela})
         group by p.cliente_id) r on true
     where c.conta_id = ${contaId}
     group by c.id
  `);
  return new Map((rows as { id: string; enviados: number; compraram: number; vendido: number }[]).map((r) => [r.id, r]));
}
