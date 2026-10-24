import { FormEsqueciSenha } from "../_acesso/formularios";
import { Moldura } from "../_acesso/moldura";

export const metadata = { title: "Esqueci a senha · Plist" };

export default function EsqueciSenha() {
  return (
    <Moldura titulo="Esqueceu a senha?" sub="Digite o e-mail da sua conta. Mandamos um link para você criar uma senha nova.">
      <FormEsqueciSenha />
      <p className="rodape-form">Lembrou? <a href="/entrar">Voltar para Entrar</a></p>
    </Moldura>
  );
}
