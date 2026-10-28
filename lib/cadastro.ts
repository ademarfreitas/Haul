// Cadastro do Plist. Antes do lançamento ele fica fechado: /cadastro vira lista de espera e só o dono cria
// acessos pelo /admin. Para abrir para todo mundo, CADASTRO_ABERTO=sim na Vercel (e redeploy).
import { sql } from "drizzle-orm";
import { obterDb } from "@/db/cliente";

export function cadastroAberto(): boolean {
  return ["sim", "1", "true"].includes((process.env.CADASTRO_ABERTO ?? "").trim().toLowerCase());
}

export function emailRepetido(e: unknown): boolean {
  const codigo = (x: unknown) => (x && typeof x === "object" && "code" in x ? (x as { code: unknown }).code : undefined);
  return codigo(e) === "23505" || codigo((e as { cause?: unknown })?.cause) === "23505";
}

type NovaConta = {
  nome: string;
  email: string;
  senhaHash: string | null;
  plano: "essencial" | "profissional" | "avancado" | null;
  ciclo: "mensal" | "anual";
  testeAte?: Date; // sem data, o teste de 30 dias que é o padrão da tabela
};

// Conta e usuário num comando só: ou nascem os dois, ou nenhum. E-mail repetido sobe o erro 23505 (ver emailRepetido).
export async function criarContaComUsuario(n: NovaConta): Promise<{ conta_id: string; usuario_id: string } | undefined> {
  const teste = n.testeAte ? sql`${n.testeAte.toISOString()}::timestamptz` : sql`now() + interval '30 days'`;
  const r = await obterDb().execute<{ conta_id: string; usuario_id: string }>(sql`
    with c as (
      insert into contas (nome, plano, ciclo, teste_ate) values (${n.nome}, ${n.plano}, ${n.ciclo}, ${teste}) returning id
    )
    insert into usuarios (conta_id, nome, email, senha_hash)
    select c.id, ${n.nome}, ${n.email}, ${n.senhaHash} from c
    returning conta_id, id as usuario_id`);
  return r.rows[0];
}
