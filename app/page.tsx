import { redirect } from "next/navigation";

// Raiz do sistema (app.plist.com.br). Nos outros endereços a raiz é o site (next.config.ts).
// /inventario manda para /entrar ou para os primeiros passos quando falta algo.
export default function Inicio() {
  redirect("/inventario");
}
