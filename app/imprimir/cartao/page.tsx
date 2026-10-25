// Cartões com o QR da página de cadastro da loja (CRM): uma folha A4 com 8 cartões para recortar.
// Fora do (sistema) para sair sem o menu na impressão.
import { redirect } from "next/navigation";
import { exigirConta } from "@/lib/conta";
import { temCrm } from "@/lib/crm";
import { DE, deValido } from "@/lib/crm-captacao";
import { qrSvg } from "@/lib/qr";
import { Imprimir } from "./imprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cartões para imprimir · Plist" };

const CSS = `
.folha { width: 210mm; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; background: #fff; }
.cartao-qr { box-sizing: border-box; height: 70mm; padding: 7mm 8mm; border: 1px dashed #c9cbd6; display: flex; gap: 6mm; align-items: center; font-family: Inter, system-ui, sans-serif; color: #14111f; }
.cartao-qr .qr { width: 34mm; height: 34mm; flex: none; }
.cartao-qr .qr svg { width: 100%; height: 100%; display: block; }
.cartao-qr b { display: block; font-size: 15pt; line-height: 1.15; letter-spacing: -.01em; }
.cartao-qr p { margin: 2.5mm 0 0; font-size: 9.5pt; line-height: 1.35; }
.cartao-qr small { display: block; margin-top: 2.5mm; font-size: 7.5pt; color: #6b6880; word-break: break-all; }
.barra-imp { max-width: 210mm; margin: 16px auto; padding: 0 16px; display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; font-family: Inter, system-ui, sans-serif; font-size: 14px; }
@media print { .barra-imp { display: none; } body { margin: 0; } @page { size: A4; margin: 8.5mm 0; } }
`;

export default async function Cartoes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { conta } = await exigirConta("/crm/captacao");
  if (!temCrm(conta) || !conta.captacaoCodigo) redirect("/crm/captacao");
  const de = deValido((await searchParams).de);
  const base = (process.env.APP_URL || "https://app.plist.com.br").replace(/\/$/, "");
  const link = `${base}/c/${conta.captacaoCodigo}${de === "pacote" ? "?de=pacote" : ""}`;
  const svg = await qrSvg(link);
  const comCupom = DE[de].cupom && !!conta.captacaoBeneficio;

  const titulo = de === "pacote" ? "Obrigado pela compra!" : comCupom ? `Ganhe ${conta.captacaoBeneficio}` : `Novidades da ${conta.nome}`;
  const texto =
    de === "pacote"
      ? `Aponte a câmera e receba as novidades da ${conta.nome} em primeira mão.`
      : comCupom
        ? `Aponte a câmera, cadastre seu WhatsApp e use o cupom na próxima compra com a ${conta.nome}.`
        : `Aponte a câmera e cadastre seu WhatsApp para saber primeiro das peças novas.`;

  return (
    <>
      <style>{CSS}</style>
      <div className="barra-imp">
        <span>
          {DE[de].rotulo}: 8 cartões por folha A4. Recorte na linha tracejada.
        </span>
        <Imprimir />
      </div>
      <div className="folha">
        {Array.from({ length: 8 }, (_, i) => (
          <div className="cartao-qr" key={i}>
            <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
            <div>
              <b>{titulo}</b>
              <p>{texto}</p>
              <small>{link.replace(/^https?:\/\//, "")}</small>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
