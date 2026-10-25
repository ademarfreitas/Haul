// "Preencher com IA" do Novo anúncio: o Claude olha as fotos e o que o lojista já escreveu e devolve título,
// descrição e ficha. Modelo, limites e teto de custo em lib/ia-limites.ts. ANTHROPIC_API_KEY fica na Vercel.
import Anthropic from "@anthropic-ai/sdk";
import { and, count, eq, gte, sum } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { type contas, usosIa } from "@/db/schema";
import { diasDeTeste } from "@/lib/conta";
import {
  custoMicroReais,
  inicioDoMes,
  limparSugestao,
  MAX_TOKENS_SAIDA,
  MODELO_IA,
  situacaoIa,
  TITULO_CURTO,
  TITULO_LONGO,
  type SugestaoIa,
} from "@/lib/ia-limites";

export function iaConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

type Conta = Pick<typeof contas.$inferSelect, "id" | "plano" | "situacaoAssinatura" | "testeAte">;

export async function situacaoIaDaConta(conta: Conta) {
  const [r] = await obterDb()
    .select({ n: count(), gasto: sum(usosIa.custoMicroReais) })
    .from(usosIa)
    .where(and(eq(usosIa.contaId, conta.id), gte(usosIa.criadoEm, inicioDoMes())));
  const emTeste = conta.situacaoAssinatura === "teste" && diasDeTeste(conta.testeAte) > 0;
  const plano = conta.situacaoAssinatura === "cancelada" ? null : conta.plano;
  return situacaoIa({ plano, emTeste }, r?.n ?? 0, Number(r?.gasto ?? 0));
}

export type DadosIa = { titulo?: string; marca?: string; cor?: string; tamanho?: string; condicao?: string; descricao?: string; notas?: string };

const INSTRUCOES = `Você escreve anúncios de marketplace (Mercado Livre, Shopee) para pequenos lojistas brasileiros, em português do Brasil.
Recebe fotos do produto e o que o lojista já sabe. Devolva só o JSON pedido.

Regras:
- Use só o que aparece nas fotos ou nos dados do lojista. Não invente marca, material, medida, modelo, tamanho ou ano. Se não der para saber, deixe o campo vazio e diga em "faltou" o que o lojista precisa informar (ex.: "medidas", "tamanho da etiqueta").
- Marca só se estiver legível na foto ou nos dados. Nunca cite marca que o produto não é ("tipo Zara", "estilo Nike" derrubam o anúncio).
- tituloCurto: até ${TITULO_CURTO} caracteres, para o Mercado Livre. Ordem: o que é + marca + modelo/detalhe + cor + tamanho. Sem ponto final, sem caixa alta, sem emoji, sem "promoção", "frete grátis" ou "original".
- titulo: até ${TITULO_LONGO} caracteres, para a Shopee, com as mesmas regras e mais detalhes úteis na busca.
- descricao: texto simples, sem markdown e sem emoji. Um parágrafo curto do que é; depois linhas com "- " para detalhes, medidas e estado. Se for usado, descreva os sinais de uso que aparecem. Não fale de prazo, frete, garantia nem contato fora do marketplace.
- condicao: um dos valores da lista, ou "" se não der para saber. Novo com etiqueta só se a etiqueta aparecer.
- Se o lojista escreveu algo, respeite: os dados dele valem mais que o que você vê.`;

const FORMATO = {
  type: "object",
  properties: {
    tituloCurto: { type: "string" },
    titulo: { type: "string" },
    descricao: { type: "string" },
    marca: { type: "string" },
    cor: { type: "string" },
    tamanho: { type: "string" },
    condicao: { type: "string", enum: ["", "nova_com_etiqueta", "nova_sem_etiqueta", "seminova", "usada_bom_estado", "usada_com_detalhes"] },
    faltou: { type: "array", items: { type: "string" } },
  },
  required: ["tituloCurto", "titulo", "descricao", "marca", "cor", "tamanho", "condicao", "faltou"],
  additionalProperties: false,
};

export class ErroIa extends Error {}

// Uma chamada ao Claude. Grava o uso (conta no limite e no teto) mesmo se a resposta vier ruim.
export async function sugerirAnuncio(contaId: string, usuarioId: string | null, fotos: { tipo: "image/jpeg"; base64: string }[], dados: DadosIa): Promise<SugestaoIa> {
  const conhecidos = Object.entries(dados)
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => `${k}: ${String(v).trim().slice(0, 1500)}`)
    .join("\n");
  const cliente = new Anthropic({ maxRetries: 1, timeout: 45_000 });
  let r: Anthropic.Message;
  try {
    r = await cliente.messages.create({
      model: MODELO_IA,
      max_tokens: MAX_TOKENS_SAIDA,
      system: INSTRUCOES,
      output_config: { effort: "low", format: { type: "json_schema", schema: FORMATO } },
      messages: [
        {
          role: "user",
          content: [
            ...fotos.map((f) => ({ type: "image" as const, source: { type: "base64" as const, media_type: f.tipo, data: f.base64 } })),
            { type: "text", text: conhecidos ? `O que o lojista já informou:\n${conhecidos}` : "O lojista não escreveu nada; use só as fotos." },
          ],
        },
      ],
    });
  } catch (e) {
    console.error("IA falhou:", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    if (e instanceof Anthropic.RateLimitError) throw new ErroIa("A IA está ocupada. Tente de novo em um minuto.");
    throw new ErroIa("A IA não respondeu agora. Tente de novo.");
  }

  await obterDb()
    .insert(usosIa)
    .values({
      contaId,
      usuarioId,
      modelo: MODELO_IA,
      tokensEntrada: r.usage.input_tokens,
      tokensSaida: r.usage.output_tokens,
      custoMicroReais: custoMicroReais(r.usage),
    });

  if (r.stop_reason === "refusal") throw new ErroIa("A IA não quis descrever estas fotos. Preencha à mão.");
  const texto = r.content.find((b) => b.type === "text");
  let bruto: unknown = null;
  try {
    bruto = texto?.type === "text" ? JSON.parse(texto.text) : null;
  } catch {
    bruto = null;
  }
  const sugestao = limparSugestao(bruto);
  if (!sugestao) throw new ErroIa("A IA não conseguiu montar o anúncio. Tente com outra foto ou escreva o que é o produto.");
  return sugestao;
}
