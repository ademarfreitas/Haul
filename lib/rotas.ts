import { NextResponse } from "next/server";

// Redireciona para um caminho do app. Usa APP_URL (e não o host da requisição) porque atrás de
// túnel ou proxy o host recebido pode não ser o endereço público.
export function irPara(caminho: string, req: Request): NextResponse {
  const base = process.env.APP_URL || new URL(req.url).origin;
  return NextResponse.redirect(new URL(caminho, base), { status: 303 });
}
