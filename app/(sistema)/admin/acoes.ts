"use server";
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { obterDb } from "@/db/cliente";
import { cobrancas, contas, indicacoes } from "@/db/schema";
import { ehAdmin } from "@/lib/admin";
import { periodoDoPagamento } from "@/lib/assinantes";
import { criarContaComUsuario, emailRepetido } from "@/lib/cadastro";
import { reais } from "@/lib/canais";
import { contaAtual } from "@/lib/conta";
import { emailConfigurado, enviarEmail } from "@/lib/email";
import { saldoDeIndicacao } from "@/lib/indicacao";
import { CICLOS, descontoIndicacao, PLANOS, precoNoCiclo } from "@/lib/planos";
import { gerarTokenSenha } from "@/lib/redefinir-senha";
import { gerarHash, SENHA_MINIMA } from "@/lib/senha";
import { emailValido } from "@/lib/validar";

const FORMAS = ["pix", "boleto", "cartao", "manual"] as const;
const DIAS_DE_PREMIO = 30;
const texto = (f: FormData, nome: string, max = 200) => String(f.get(nome) ?? "").trim().slice(0, max);

// Lançamento à mão de uma mensalidade (ou anuidade) recebida (Pix direto, por exemplo) enquanto o provedor de cobrança não
// está ligado. Grava a cobrança paga, empurra o "pago até" da conta e, se for a primeira, dá o prêmio da indicação.
export async function registrarPagamento(f: FormData): Promise<void> {
  const atual = await contaAtual();
  if (!atual || !ehAdmin(atual.usuario.email)) return;
  const plano = PLANOS.find((p) => p.id === texto(f, "plano", 20));
  const forma = FORMAS.find((x) => x === texto(f, "forma", 10));
  const ciclo = CICLOS.find((x) => x === texto(f, "ciclo", 10)) ?? "mensal";
  if (!plano || !forma) return;
  const db = obterDb();
  const [conta] = await db.select().from(contas).where(eq(contas.id, texto(f, "conta", 40))).limit(1);
  if (!conta) return;

  const agora = new Date();
  const { inicio, fim } = periodoDoPagamento(conta, agora, ciclo);
  const primeira = !conta.pagoAte;
  // indicação (indicada ou quem indicou): 5% nos meses que ainda tem de saldo; o valor gravado já sai com o desconto
  const desconto = descontoIndicacao(plano, ciclo, (await saldoDeIndicacao(conta.id))?.saldo ?? 0);
  const obs = texto(f, "obs", 300) || `lançado à mão por ${atual.usuario.email}`;
  await db.insert(cobrancas).values({
    contaId: conta.id,
    plano: plano.id,
    ciclo,
    valorCentavos: precoNoCiclo(plano, ciclo) - desconto,
    periodoInicio: inicio,
    periodoFim: fim,
    vencimento: inicio,
    situacao: "paga",
    forma,
    pagaEm: agora,
    taxaProvedorCentavos: forma === "manual" ? 0 : null,
    observacao: desconto ? `${obs} · desconto de indicação: ${reais(desconto)}` : obs,
  });
  await db.update(contas).set({ plano: plano.id, ciclo, pagoAte: fim, situacaoAssinatura: "ativa" }).where(eq(contas.id, conta.id));

  // Indicação: quem indicou ganha 30 dias quando a indicada paga a primeira mensalidade (uma vez só). A data do prêmio
  // também dá a quem indicou 12 meses com 5% de desconto (lib/indicacao.ts).
  if (primeira) {
    const [ind] = await db
      .select({ id: indicacoes.id, indicadora: contas })
      .from(indicacoes)
      .innerJoin(contas, eq(contas.id, indicacoes.indicadoraId))
      .where(and(eq(indicacoes.indicadaId, conta.id), isNull(indicacoes.recompensaConcedidaEm)))
      .limit(1);
    if (ind) {
      const somar = (d: Date) => new Date(Math.max(d.getTime(), agora.getTime()) + DIAS_DE_PREMIO * 86_400_000);
      await db
        .update(contas)
        .set(ind.indicadora.pagoAte ? { pagoAte: somar(ind.indicadora.pagoAte) } : { testeAte: somar(ind.indicadora.testeAte) })
        .where(eq(contas.id, ind.indicadora.id));
      await db.update(indicacoes).set({ recompensaConcedidaEm: agora }).where(eq(indicacoes.id, ind.id));
    }
  }
  revalidatePath("/admin");
}

export type RespostaAcesso = { erro?: string; ok?: string; email?: string; senha?: string; valores?: Record<string, string> };

const DIAS_DE_CONVITE = 7;

// Antes do lançamento só entra quem o dono cria aqui. Sem senha digitada, o Plist gera uma e mostra uma vez só;
// com "mandar convite", a pessoa recebe por e-mail um link de 7 dias para criar a própria senha.
export async function criarAcesso(_: RespostaAcesso, f: FormData): Promise<RespostaAcesso> {
  const atual = await contaAtual();
  if (!atual || !ehAdmin(atual.usuario.email)) return { erro: "Só o dono do Plist cria acessos." };
  const nome = texto(f, "nome", 120).replace(/\s+/g, " ");
  const email = texto(f, "email").toLowerCase();
  const digitada = String(f.get("senha") ?? "");
  const plano = PLANOS.find((p) => p.id === texto(f, "plano", 20))?.id ?? null;
  const dias = Math.round(Number(texto(f, "dias", 4) || 30));
  const convite = f.get("convite") === "on";
  const valores = { nome, email, plano: plano ?? "", dias: String(dias), convite: convite ? "on" : "" };

  if (nome.split(" ").length < 2) return { erro: "Escreva nome e sobrenome.", valores };
  if (!emailValido(email)) return { erro: "Esse e-mail não parece certo.", valores };
  if (digitada && digitada.length < SENHA_MINIMA) return { erro: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres (ou deixe em branco).`, valores };
  if (digitada.length > 200) return { erro: "Essa senha é longa demais.", valores };
  if (!Number.isFinite(dias) || dias < 1 || dias > 365) return { erro: "O teste vai de 1 a 365 dias.", valores };
  if (convite && !emailConfigurado()) return { erro: "O envio de e-mail não está configurado: desmarque o convite e passe a senha você mesmo.", valores };

  const senha = digitada || gerarSenha();
  const senhaHash = await gerarHash(senha);
  let ids: { conta_id: string; usuario_id: string } | undefined;
  try {
    ids = await criarContaComUsuario({ nome, email, senhaHash, plano, ciclo: "mensal", testeAte: new Date(Date.now() + dias * 86_400_000) });
  } catch (e) {
    if (emailRepetido(e)) return { erro: "Já existe uma conta com esse e-mail.", valores };
    throw e;
  }
  if (!ids) return { erro: "Não deu para criar o acesso agora. Tente de novo.", valores };
  revalidatePath("/admin");

  const base = (process.env.APP_URL || "").replace(/\/$/, "");
  if (convite) {
    const link = `${base}/nova-senha?t=${encodeURIComponent(gerarTokenSenha(ids.usuario_id, senhaHash, DIAS_DE_CONVITE * 86_400))}`;
    const primeiro = nome.split(" ")[0];
    try {
      await enviarEmail(
        email,
        "Seu acesso ao Plist",
        `Olá, ${primeiro}.\n\nSeu acesso ao Plist está pronto. Para criar sua senha e entrar, abra este link (vale por ${DIAS_DE_CONVITE} dias):\n${link}\n\nDepois, é só entrar em ${base}/entrar com o e-mail ${email}.`,
        `<p>Olá, ${primeiro.replace(/[<>&"]/g, "")}.</p><p>Seu acesso ao Plist está pronto. Clique no botão para criar sua senha e entrar. O link vale por ${DIAS_DE_CONVITE} dias.</p>` +
          `<p><a href="${link}" style="display:inline-block;background:#2B47D0;color:#fff;padding:12px 20px;border-radius:9px;text-decoration:none;font-weight:600">Criar minha senha</a></p>` +
          `<p style="color:#666;font-size:13px">Depois, é só entrar em ${base}/entrar com o e-mail ${email.replace(/[<>&"]/g, "")}.</p>`,
      );
    } catch (e) {
      console.error("convite do admin:", e);
      return { ok: "Acesso criado, mas o e-mail de convite não saiu. Passe a senha abaixo para a pessoa.", email, senha };
    }
    return { ok: `Acesso criado e convite enviado para ${email}.`, email, senha: digitada ? undefined : senha };
  }
  return { ok: "Acesso criado. Passe o e-mail e a senha para a pessoa (a senha só aparece agora).", email, senha };
}

// 14 letras e números sem os que se confundem (0/O, 1/l/I)
function gerarSenha(): string {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(14), (b) => letras[b % letras.length]).join("");
}
