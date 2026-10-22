import { redirect } from "next/navigation";

// Por enquanto o app só tem a tela de canais; o site público e o login vêm depois.
export default function Inicio() {
  redirect("/canais");
}
