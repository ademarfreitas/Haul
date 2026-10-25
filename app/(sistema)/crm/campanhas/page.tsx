import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { obterDb } from "@/db/cliente";
import { campanhas } from "@/db/schema";
import { reais } from "@/lib/canais";
import { exigirConta } from "@/lib/conta";
import { retornoDasCampanhas, temCrm } from "@/lib/crm";
import { descreveFiltro, JANELA_RETORNO } from "@/lib/crm-funil";
import { CabecalhoCrm } from "../partes";
import { Vitrine } from "../vitrine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campanhas · CRM · Plist" };

export default async function Campanhas() {
  const { conta } = await exigirConta("/crm/campanhas");
  if (!temCrm(conta)) return <Vitrine />;
  const [lista, retorno] = await Promise.all([
    obterDb().select().from(campanhas).where(eq(campanhas.contaId, conta.id)).orderBy(desc(campanhas.criadoEm)).limit(100),
    retornoDasCampanhas(conta.id, JANELA_RETORNO),
  ]);

  return (
    <>
      <CabecalhoCrm aba="campanhas" sub="Uma mensagem para um grupo dos seus clientes próprios, mandada um a um pelo seu WhatsApp, sem custo e sem disparo em massa." />
      <p className="muted" style={{ fontSize: ".84rem", margin: "0 0 12px" }}>
        Compradores do Mercado Livre, Shopee e outros marketplaces só entram se deixaram o contato na sua página de cadastro (aba Captação): o canal não
        passa o contato e proíbe oferta fora dele. Oferta vai só para quem aceitou receber (LGPD).
      </p>
      <div className="tablewrap">
        <table>
          <tbody>
            <tr>
              <th>Campanha</th>
              <th>Para quem</th>
              <th>Tipo</th>
              <th className="num">Enviadas</th>
              <th className="num">Compraram em {JANELA_RETORNO} dias</th>
              <th className="num">Vendido</th>
            </tr>
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 28 }}>
                  Nenhuma campanha ainda. Crie a primeira em <Link href="/crm/campanhas/nova">+ Campanha</Link>.
                </td>
              </tr>
            )}
            {lista.map((c) => {
              const r = retorno.get(c.id);
              return (
                <tr key={c.id}>
                  <td className="item">
                    <Link href={`/crm/campanhas/${c.id}`}>
                      #{c.numero} {c.nome}
                    </Link>
                    <span className="sub2">{c.criadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                  </td>
                  <td>{descreveFiltro(c.filtro)}</td>
                  <td>
                    <span className={`pill ${c.tipo === "oferta" ? "p-accent" : "p-muted"}`}>{c.tipo === "oferta" ? "Oferta" : "Relacionamento"}</span>
                  </td>
                  <td className="num">{r?.enviados ?? 0}</td>
                  <td className="num">{r?.compraram ?? 0}</td>
                  <td className="num">{reais(r?.vendido ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
