// Plano B enquanto o app do Plist não é aprovado na Shein: o lojista cola o open key ID e a secret key
// que a própria Shein entrega a ele (como fazem alguns ERPs). O Plist confere as chaves numa chamada
// antes de gravar, e guarda a secret key cifrada como guarda os tokens dos outros canais.
import { contaDaSessao } from "@/lib/sessao";
import { ErroShein, lojaShein, salvarConexaoShein } from "@/lib/shein";
import { irPara } from "@/lib/rotas";

export async function POST(req: Request) {
  const contaId = await contaDaSessao();
  if (!contaId) return irPara("/canais?shein_erro=sem_sessao", req);
  const form = await req.formData().catch(() => null);
  const openKeyId = String(form?.get("openKeyId") ?? "").trim().slice(0, 200);
  const secretKey = String(form?.get("secretKey") ?? "").trim().slice(0, 500);
  if (!openKeyId || !secretKey) return irPara("/canais?shein_erro=chaves_vazias", req);

  try {
    const chaves = { openKeyId, secretKey };
    await salvarConexaoShein(contaId, chaves, await lojaShein(chaves));
    return irPara("/canais?shein=conectado", req);
  } catch (e) {
    const codigo = e instanceof ErroShein ? e.codigo : "falha_interna";
    console.error("chaves Shein recusadas:", codigo);
    return irPara(`/canais?shein_erro=${encodeURIComponent(codigo === "reconectar" ? "chaves_recusadas" : codigo)}`, req);
  }
}
