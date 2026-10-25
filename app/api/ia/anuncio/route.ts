// "Preencher com IA": recebe até 4 fotos já reduzidas no navegador e o que o lojista escreveu, confere o limite
// do plano e o teto de custo do mês e devolve a sugestão. GET diz quantos usos restam no mês.
import { NextResponse } from "next/server";
import { contaAtual } from "@/lib/conta";
import { ErroIa, iaConfigurada, situacaoIaDaConta, sugerirAnuncio, type DadosIa } from "@/lib/ia";
import { FOTOS_PARA_IA } from "@/lib/ia-limites";

export const maxDuration = 60;

const MAXIMO_FOTO = 400 * 1024; // 768 px em JPEG fica bem abaixo disso
const CAMPOS: (keyof DadosIa)[] = ["titulo", "marca", "cor", "tamanho", "condicao", "descricao", "notas"];

export async function GET() {
  const atual = await contaAtual();
  if (!atual) return NextResponse.json({ erro: "Sua sessão terminou. Entre de novo." }, { status: 401 });
  if (!iaConfigurada()) return NextResponse.json({ pode: false, restam: 0, limite: 0, motivo: "A IA ainda não foi ligada no Plist." });
  return NextResponse.json(await situacaoIaDaConta(atual.conta));
}

export async function POST(req: Request) {
  const atual = await contaAtual();
  if (!atual) return NextResponse.json({ erro: "Sua sessão terminou. Entre de novo." }, { status: 401 });
  if (!iaConfigurada()) return NextResponse.json({ erro: "A IA ainda não foi ligada no Plist." }, { status: 503 });

  const situacao = await situacaoIaDaConta(atual.conta);
  if (!situacao.pode) return NextResponse.json({ erro: situacao.motivo, ...situacao }, { status: 429 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  const fotos: { tipo: "image/jpeg"; base64: string }[] = [];
  for (const f of form.getAll("foto").slice(0, FOTOS_PARA_IA)) {
    if (!(f instanceof Blob) || f.type !== "image/jpeg" || f.size > MAXIMO_FOTO) continue;
    fotos.push({ tipo: "image/jpeg", base64: Buffer.from(await f.arrayBuffer()).toString("base64") });
  }
  const dados: DadosIa = {};
  for (const c of CAMPOS) {
    const v = form.get(c);
    if (typeof v === "string" && v.trim()) dados[c] = v.trim().slice(0, 2000);
  }
  if (!fotos.length && !dados.titulo && !dados.notas) {
    return NextResponse.json({ erro: "Coloque pelo menos uma foto ou escreva o que é o produto." }, { status: 400 });
  }

  try {
    const sugestao = await sugerirAnuncio(atual.conta.id, atual.usuario.id, fotos, dados);
    return NextResponse.json({ sugestao, restam: Math.max(0, situacao.restam - 1), limite: situacao.limite });
  } catch (e) {
    // o uso só conta se o Claude chegou a responder; relê para mostrar o número certo
    const { restam } = await situacaoIaDaConta(atual.conta);
    return NextResponse.json({ erro: e instanceof ErroIa ? e.message : "A IA não respondeu agora. Tente de novo.", restam }, { status: 502 });
  }
}
