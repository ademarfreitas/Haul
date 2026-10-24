// CRM do Plist (plano Avançado). Desenho e decisões em docs/crm.md.
import { sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import type { contas } from "@/db/schema";
import { diasDeTeste } from "@/lib/conta";

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

