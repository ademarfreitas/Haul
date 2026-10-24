// Testa uma conexão: pega um token válido (renovando se preciso) e busca os dados da loja.
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { conexoesCanal } from "@/db/schema";
import { contaDaSessao } from "@/lib/sessao";
import { chamarShopee, ErroShopee, lojaValida, type LojaShopee } from "@/lib/shopee";

export async function GET(req: Request) {
  const contaId = await contaDaSessao();
  const id = new URL(req.url).searchParams.get("id");
  if (!contaId || !id) return NextResponse.json({ ok: false, erro: "sem_sessao" }, { status: 401 });

  const [c] = await obterDb()
    .select({ id: conexoesCanal.id })
    .from(conexoesCanal)
    .where(and(eq(conexoesCanal.id, id), eq(conexoesCanal.contaId, contaId), eq(conexoesCanal.canal, "shopee")));
  if (!c) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  try {
    const loja = await lojaValida(c.id);
    const info = await chamarShopee<LojaShopee>("/api/v2/shop/get_shop_info", loja);
    return NextResponse.json({ ok: true, loja: loja.shopId, nome: info.shop_name, regiao: info.region, situacao: info.status });
  } catch (e) {
    const erro = e instanceof ErroShopee ? e.codigo : "falha_interna";
    return NextResponse.json({ ok: false, erro }, { status: e instanceof ErroShopee ? e.status : 500 });
  }
}
