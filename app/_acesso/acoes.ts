"use server";
// Cadastro, login, saída e primeiros passos. Cada ação devolve { erro, valores } para o formulário
// mostrar a mensagem sem apagar o que a pessoa digitou (a senha nunca volta).
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { obterDb } from "@/db/cliente";
import { contas, indicacoes, usuarios } from "@/db/schema";
import { contaAtual, destinoSeguro } from "@/lib/conta";
import { bloqueado, limparFalhas, registrarFalha } from "@/lib/limite";
import { emailConfigurado, enviarEmail } from "@/lib/email";
import { gerarTokenSenha, lerTokenSenha, valeParaSenha } from "@/lib/redefinir-senha";
import { conferirSenha, gerarHash, SENHA_MINIMA } from "@/lib/senha";
import { abrirSessao, fecharSessao } from "@/lib/sessao";
import { celularE164, cnpjValido, cpfValido, emailValido, soDigitos } from "@/lib/validar";

export type Estado = { erro?: string; ok?: string; valores?: Record<string, string> };

const texto = (f: FormData, nome: string) => String(f.get(nome) ?? "").trim();

// ids dos planos no site → enum do banco
const PLANOS = { essencial: "essencial", pro: "profissional", profissional: "profissional", avancado: "avancado" } as const;

function emailRepetido(e: unknown): boolean {
  const codigo = (x: unknown) => (x && typeof x === "object" && "code" in x ? (x as { code: unknown }).code : undefined);
  return codigo(e) === "23505" || codigo((e as { cause?: unknown })?.cause) === "23505";
}

export async function cadastrar(_: Estado, f: FormData): Promise<Estado> {
  const nome = texto(f, "nome").replace(/\s+/g, " ");
  const email = texto(f, "email").toLowerCase();
  const senha = String(f.get("senha") ?? "");
  const plano = PLANOS[texto(f, "plano") as keyof typeof PLANOS] ?? null;
  const ciclo = texto(f, "ciclo") === "anual" ? "anual" : "mensal";
  const ind = texto(f, "ind");
  const valores = { nome, email, plano: texto(f, "plano"), ciclo, ind };

  if (nome.split(" ").length < 2 || nome.length > 120) return { erro: "Escreva nome e sobrenome.", valores };
  if (!emailValido(email)) return { erro: "Esse e-mail não parece certo. Confira e tente de novo.", valores };
  if (senha.length < SENHA_MINIMA) return { erro: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`, valores };
  if (senha.length > 200) return { erro: "Essa senha é longa demais.", valores };

  const db = obterDb();
  const [existe] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(sql`lower(${usuarios.email})`, email)).limit(1);
  if (existe) return { erro: "Já existe uma conta com esse e-mail. Entre com ela.", valores };

  const senhaHash = await gerarHash(senha);
  let ids: { conta_id: string; usuario_id: string } | undefined;
  try {
    // conta e usuário num comando só: ou nascem os dois, ou nenhum. O teste de 30 dias é o padrão da tabela.
    const r = await db.execute<{ conta_id: string; usuario_id: string }>(sql`
      with c as (
        insert into contas (nome, plano, ciclo) values (${nome}, ${plano}, ${ciclo}) returning id
      )
      insert into usuarios (conta_id, nome, email, senha_hash)
      select c.id, ${nome}, ${email}, ${senhaHash} from c
      returning conta_id, id as usuario_id`);
    ids = r.rows[0];
  } catch (e) {
    if (emailRepetido(e)) return { erro: "Já existe uma conta com esse e-mail. Entre com ela.", valores };
    throw e;
  }
  if (!ids) return { erro: "Não deu para criar a conta agora. Tente de novo.", valores };

  // veio pelo link de indicação de outra conta: registra (o prêmio sai quando a nova conta pagar)
  if (/^[0-9a-f-]{36}$/.test(ind) && ind !== ids.conta_id) {
    const [indicadora] = await db.select({ id: contas.id }).from(contas).where(eq(contas.id, ind)).limit(1);
    if (indicadora) await db.insert(indicacoes).values({ indicadoraId: indicadora.id, indicadaId: ids.conta_id }).onConflictDoNothing();
  }

  await abrirSessao({ c: ids.conta_id, u: ids.usuario_id }, true);
  redirect("/primeiros-passos");
}

export async function entrar(_: Estado, f: FormData): Promise<Estado> {
  const email = texto(f, "email").toLowerCase();
  const senha = String(f.get("senha") ?? "");
  const manter = f.get("manter") === "on";
  const volta = texto(f, "volta");
  const valores = { email, volta };

  if (!emailValido(email)) return { erro: "Digite o e-mail da sua conta.", valores };
  if (!senha) return { erro: "Digite a senha.", valores };
  if (bloqueado(email)) return { erro: "Muitas tentativas. Espere 15 minutos e tente de novo.", valores };

  const [u] = await obterDb()
    .select({ id: usuarios.id, contaId: usuarios.contaId, senhaHash: usuarios.senhaHash })
    .from(usuarios)
    .where(eq(sql`lower(${usuarios.email})`, email))
    .limit(1);
  // a mesma mensagem para e-mail desconhecido e senha errada
  if (!(await conferirSenha(senha.slice(0, 200), u?.senhaHash)) || !u) {
    registrarFalha(email);
    return { erro: "E-mail ou senha não conferem.", valores };
  }
  limparFalhas(email);
  await abrirSessao({ c: u.contaId, u: u.id }, manter);
  redirect(destinoSeguro(volta));
}

// "Esqueci a senha": manda por e-mail um link de 1 hora para criar uma senha nova. A resposta é a
// mesma exista ou não a conta, para ninguém descobrir quais e-mails têm cadastro.
export async function pedirNovaSenha(_: Estado, f: FormData): Promise<Estado> {
  const email = texto(f, "email").toLowerCase();
  const valores = { email };
  if (!emailValido(email)) return { erro: "Digite o e-mail da sua conta.", valores };
  if (!emailConfigurado()) return { erro: "O envio de e-mail ainda não está configurado. Fale com o suporte do Plist.", valores };
  const chave = "senha:" + email;
  if (bloqueado(chave)) return { erro: "Muitos pedidos seguidos. Espere 15 minutos e tente de novo.", valores };
  registrarFalha(chave);

  const [u] = await obterDb()
    .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, senhaHash: usuarios.senhaHash })
    .from(usuarios)
    .where(eq(sql`lower(${usuarios.email})`, email))
    .limit(1);
  if (u) {
    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    const link = `${base}/nova-senha?t=${encodeURIComponent(gerarTokenSenha(u.id, u.senhaHash))}`;
    const primeiro = u.nome.split(" ")[0];
    try {
      await enviarEmail(
      u.email,
      "Crie uma senha nova no Plist",
      `Olá, ${primeiro}.\n\nPara criar uma senha nova no Plist, abra este link (vale por 1 hora):\n${link}\n\nSe não foi você que pediu, ignore este e-mail. Sua senha continua a mesma.`,
      `<p>Olá, ${primeiro.replace(/[<>&"]/g, "")}.</p><p>Para criar uma senha nova no Plist, clique no botão abaixo. O link vale por 1 hora.</p>` +
        `<p><a href="${link}" style="display:inline-block;background:#2B47D0;color:#fff;padding:12px 20px;border-radius:9px;text-decoration:none;font-weight:600">Criar senha nova</a></p>` +
        `<p style="color:#666;font-size:13px">Se não foi você que pediu, ignore este e-mail. Sua senha continua a mesma.</p>`,
      );
    } catch (e) {
      console.error("esqueci a senha:", e);
      return { erro: "Não deu para enviar o e-mail agora. Tente de novo em alguns minutos.", valores };
    }
  }
  return { ok: "Se esse e-mail tiver conta no Plist, enviamos um link para criar uma senha nova. Confira a caixa de entrada e o spam." };
}

export async function definirNovaSenha(_: Estado, f: FormData): Promise<Estado> {
  const token = texto(f, "t");
  const senha = String(f.get("senha") ?? "");
  const repetir = String(f.get("repetir") ?? "");
  const valores = { t: token };
  const invalido = { erro: "Este link venceu ou já foi usado. Peça um novo em Esqueci a senha.", valores };

  const dados = lerTokenSenha(token);
  if (!dados) return invalido;
  if (senha.length < SENHA_MINIMA) return { erro: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`, valores };
  if (senha.length > 200) return { erro: "Essa senha é longa demais.", valores };
  if (senha !== repetir) return { erro: "As duas senhas não são iguais.", valores };

  const db = obterDb();
  const [u] = await db
    .select({ id: usuarios.id, contaId: usuarios.contaId, email: usuarios.email, senhaHash: usuarios.senhaHash })
    .from(usuarios)
    .where(eq(usuarios.id, dados.u))
    .limit(1);
  if (!u || !valeParaSenha(dados, u.senhaHash)) return invalido;

  // quem recebeu o link no e-mail provou que é dono dele
  await db.update(usuarios).set({ senhaHash: await gerarHash(senha), emailVerificadoEm: new Date() }).where(eq(usuarios.id, u.id));
  limparFalhas(u.email.toLowerCase());
  await abrirSessao({ c: u.contaId, u: u.id }, false);
  redirect("/inventario");
}

export async function sair(): Promise<void> {
  await fecharSessao();
  redirect("/entrar");
}

export async function salvarPrimeirosPassos(_: Estado, f: FormData): Promise<Estado> {
  const atual = await contaAtual();
  if (!atual) redirect("/entrar");

  const tipo = texto(f, "tipo");
  const documento = soDigitos(texto(f, "documento"));
  const razao = texto(f, "razao").replace(/\s+/g, " ");
  const celularDigitado = texto(f, "celular");
  const valores = { tipo, documento: texto(f, "documento"), razao, celular: celularDigitado };

  if (tipo !== "pf" && tipo !== "pj") return { erro: "Escolha pessoa física ou jurídica.", valores };
  if (tipo === "pf" && !cpfValido(documento)) return { erro: "Esse CPF não confere. Confira os números.", valores };
  if (tipo === "pj" && !cnpjValido(documento)) return { erro: "Esse CNPJ não confere. Confira os números.", valores };
  if (tipo === "pj" && (razao.length < 3 || razao.length > 150)) return { erro: "Escreva a razão social da empresa.", valores };
  const celular = celularE164(celularDigitado);
  if (!celular) return { erro: "Digite um celular com DDD, por exemplo (11) 91234-5678.", valores };

  await obterDb()
    .update(contas)
    .set({
      tipoPessoa: tipo,
      documento,
      celular,
      ...(tipo === "pj" ? { nome: razao } : {}),
      primeirosPassosEm: new Date(),
    })
    .where(eq(contas.id, atual.conta.id));
  redirect("/primeiros-passos/mercado-livre");
}
