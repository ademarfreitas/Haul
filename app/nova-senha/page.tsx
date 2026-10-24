import { FormNovaSenha } from "../_acesso/formularios";
import { Moldura } from "../_acesso/moldura";

export const dynamic = "force-dynamic";
export const metadata = { title: "Senha nova · Plist" };

export default async function NovaSenha({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const token = (await searchParams).t ?? "";
  return (
    <Moldura titulo="Crie uma senha nova" sub="Depois de salvar, você já entra no sistema.">
      {token ? (
        <FormNovaSenha token={token} />
      ) : (
        <p className="msg-erro">Este link está incompleto. Peça um novo em <a href="/esqueci-senha">Esqueci a senha</a>.</p>
      )}
    </Moldura>
  );
}
