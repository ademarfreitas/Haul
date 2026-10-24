// Deixa os testes importarem "@/lib/x" como o Next faz (o "@/" é a raiz do projeto, arquivos .ts).
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      const raiz = ${JSON.stringify(new URL("../", import.meta.url).href)};
      export async function resolve(especificador, contexto, proximo) {
        if (especificador.startsWith("@/")) return proximo(raiz + especificador.slice(2) + ".ts", contexto);
        return proximo(especificador, contexto);
      }
    `),
);
