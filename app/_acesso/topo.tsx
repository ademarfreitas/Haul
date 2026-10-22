import { diasDeTeste } from "@/lib/conta";
import { sair } from "./acoes";

type Props = { nome: string; situacao: string; testeAte: Date };

// Barra do sistema: logo, aviso do teste grátis, nome de quem entrou e Sair.
export function Topo({ nome, situacao, testeAte }: Props) {
  const dias = diasDeTeste(testeAte);
  return (
    <header className="topo">
      <a href="/canais"><img src="/plist-logo.svg" alt="Plist" height={26} /></a>
      <div className="topo-dir">
        {situacao === "teste" && (
          <span className="pilula">{dias > 0 ? `Teste grátis: ${dias} ${dias === 1 ? "dia" : "dias"}` : "Teste grátis terminou"}</span>
        )}
        <span className="suave">{nome}</span>
        <form action={sair}><button className="botao secundario" type="submit">Sair</button></form>
      </div>
    </header>
  );
}
