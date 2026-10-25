// QR code em SVG, desenhado no servidor (sem imagem externa nem script no navegador).
import QRCode from "qrcode";

export function qrSvg(texto: string): Promise<string> {
  return QRCode.toString(texto, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#14111F", light: "#FFFFFF" } });
}
