// E-mail transacional pela API do Resend (resend.com). EMAIL_API_KEY é a chave de lá e
// EMAIL_REMETENTE o "De", ex.: Plist <nao-responda@plist.com.br> (domínio verificado no Resend).
export function emailConfigurado(): boolean {
  return Boolean(process.env.EMAIL_API_KEY?.trim() && process.env.EMAIL_REMETENTE?.trim());
}

export async function enviarEmail(para: string, assunto: string, texto: string, html: string): Promise<void> {
  if (!emailConfigurado()) throw new Error("EMAIL_API_KEY e EMAIL_REMETENTE precisam estar no .env.local");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.EMAIL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_REMETENTE, to: [para], subject: assunto, text: texto, html }),
  });
  if (!r.ok) throw new Error(`Resend recusou o e-mail (${r.status})`);
}
