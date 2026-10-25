// Textos dos avisos de custo e estoque (tarefa e e-mail). Puro, para testar sem banco.
import { reais } from "@/lib/canais";

export type AnuncioDaPeca = { canal: string; precoCentavos: number; taxaCentavos: number | null };

// O fornecedor cobrou mais: quanto sobra agora em cada canal e o preço que mantém o que sobrava antes
// (mesma sobra em reais; a taxa do canal muda um pouco com o preço, por isso "cerca de").
export function avisoDeCusto(p: { titulo: string; antes: number; depois: number; origem: string; anuncios: AnuncioDaPeca[] }) {
  const linhas = [`O custo subiu de ${reais(p.antes)} para ${reais(p.depois)} (${p.origem}).`];
  for (const a of p.anuncios.filter((x) => x.precoCentavos > 0)) {
    const sobra = a.precoCentavos - (a.taxaCentavos ?? 0) - p.depois;
    const novo = a.precoCentavos + (p.depois - p.antes);
    linhas.push(
      `${a.canal}: vende a ${reais(a.precoCentavos)} e ${sobra >= 0 ? `sobram ${reais(sobra)}` : `perde ${reais(-sobra)}`} depois da taxa e do custo. Para sobrar o mesmo que antes, o preço iria para cerca de ${reais(novo)}.`,
    );
  }
  if (linhas.length === 1) linhas.push("A peça ainda não está anunciada: confira o preço antes de publicar.");
  return { titulo: `Custo subiu: ${p.titulo}`, detalhe: linhas.join("\n") };
}

export function avisoDeEstoque(p: { titulo: string; quantidade: number; minimo: number }) {
  return {
    titulo: `${p.quantidade <= 0 ? "Acabou" : "Estoque baixo"}: ${p.titulo}`,
    detalhe:
      p.quantidade <= 0
        ? `Não sobrou nenhuma unidade (o mínimo é ${p.minimo}). Peça ao fornecedor para não perder vendas.`
        : `Sobraram ${p.quantidade} ${p.quantidade === 1 ? "unidade" : "unidades"} (o mínimo é ${p.minimo}). Hora de repor.`,
  };
}

const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Um e-mail com todos os avisos de uma vez (uma importação pode mexer em muitas peças).
export function emailDeAvisos(avisos: { titulo: string; detalhe: string }[], linkTarefas: string) {
  const assunto = avisos.length === 1 ? `Plist: ${avisos[0].titulo}` : `Plist: ${avisos.length} avisos de custo e estoque`;
  const texto = [...avisos.map((a) => `${a.titulo}\n${a.detalhe}`), `Ver em Tarefas: ${linkTarefas}`].join("\n\n");
  const html =
    avisos.map((a) => `<p><b>${escapar(a.titulo)}</b><br>${escapar(a.detalhe).replace(/\n/g, "<br>")}</p>`).join("") +
    `<p><a href="${escapar(linkTarefas)}">Ver em Tarefas</a></p><p style="color:#646B7A;font-size:12px">Para não receber estes e-mails, desligue em Avisos no Plist.</p>`;
  return { assunto, texto, html };
}
