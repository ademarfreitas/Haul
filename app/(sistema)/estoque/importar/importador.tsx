"use client";
// Lê no navegador a nota (XML) ou a planilha (CSV) do fornecedor, mostra o que vai entrar e manda para gravar.
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { reais } from "@/lib/canais";
import {
  adivinharColunas,
  CAMPOS,
  itensDaPlanilha,
  lerCsv,
  lerNfe,
  NOMES_CAMPOS,
  type Campo,
  type ItemImportado,
  type NotaFiscal,
} from "@/lib/fornecedor-arquivo";
import { confirmarImportacao, type EstadoImportacao } from "./acoes";

const MAXIMO = 500;
type Planilha = { colunas: string[]; linhas: string[][] };

// Excel no Brasil salva CSV em Windows-1252; XML de NF-e vem em UTF-8
async function lerTexto(arquivo: File): Promise<string> {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function Enviar({ n }: { n: number }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending || !n}>
      {pending ? "Importando…" : `Importar ${n} ${n === 1 ? "produto" : "produtos"}`}
    </button>
  );
}

export function Importador({ fornecedores }: { fornecedores: { nome: string; colunas: Record<string, string> }[] }) {
  const [estado, acao] = useActionState(confirmarImportacao, {} as EstadoImportacao);
  const [erro, setErro] = useState("");
  const [nota, setNota] = useState<NotaFiscal | null>(null);
  const [planilha, setPlanilha] = useState<Planilha | null>(null);
  const [fornecedor, setFornecedor] = useState("");
  const [mapa, setMapa] = useState<Partial<Record<Campo, string>>>({});
  const [minimo, setMinimo] = useState("");

  async function escolher(arquivo: File | undefined) {
    setErro("");
    setNota(null);
    setPlanilha(null);
    if (!arquivo) return;
    if (/\.xlsx?$/i.test(arquivo.name)) return setErro("Planilha do Excel: abra no Excel e use Arquivo > Salvar como > CSV, depois escolha o arquivo .csv aqui.");
    if (arquivo.size > 5 * 1024 * 1024) return setErro("Arquivo grande demais (máximo 5 MB).");
    const texto = await lerTexto(arquivo);
    if (/<(?:\w+:)?infNFe\b/.test(texto)) {
      const n = lerNfe(texto);
      if (!n) return setErro("Não achei produtos nesta nota. Confira se é o XML da NF-e (não o PDF/DANFE).");
      setNota(n);
      setFornecedor(n.fornecedor.nome);
      return;
    }
    if (/^\s*</.test(texto)) return setErro("Este XML não é de uma NF-e. Use o XML da nota de compra que o fornecedor mandou.");
    const p = lerCsv(texto);
    if (!p.colunas.length || !p.linhas.length) return setErro("A planilha está vazia ou sem cabeçalho na primeira linha.");
    setPlanilha(p);
    setMapa(adivinharColunas(p.colunas));
  }

  // fornecedor já conhecido: usa as colunas da última vez, se a planilha tiver as mesmas
  function mudarFornecedor(nome: string) {
    setFornecedor(nome);
    const salvo = fornecedores.find((f) => f.nome.toLowerCase() === nome.trim().toLowerCase());
    if (salvo && planilha && Object.values(salvo.colunas).every((c) => planilha.colunas.includes(c))) setMapa(salvo.colunas as Partial<Record<Campo, string>>);
  }

  const itens: ItemImportado[] = nota ? nota.itens : planilha ? itensDaPlanilha(planilha.colunas, planilha.linhas, mapa) : [];
  const enviados = itens.slice(0, MAXIMO);

  if (estado.feito) {
    const f = estado.feito;
    return (
      <div className="panel" style={{ maxWidth: 760 }}>
        <h2>Importado de {f.fornecedor}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {f.criadas.length} {f.criadas.length === 1 ? "produto novo" : "produtos novos"} em rascunho · {f.atualizadas} {f.atualizadas === 1 ? "já existia e foi atualizado" : "já existiam e foram atualizados"}
          {f.custoSubiu > 0 && (
            <>
              {" "}
              · <Link href="/tarefas">{f.custoSubiu} com custo maior: veja em Tarefas</Link>
            </>
          )}
        </p>
        {f.criadas.length > 0 && (
          <>
            <p style={{ marginTop: 12, fontSize: ".88rem" }}>Para anunciar, abra cada produto, coloque as fotos e use Preencher com IA para escrever o anúncio.</p>
            <div className="list" role="list" style={{ marginTop: 8 }}>
              {f.criadas.slice(0, 50).map((c) => (
                <div className="row" role="listitem" key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "default" }}>
                  <span className="tag">{c.sku}</span>
                  <span style={{ flex: 1, minWidth: 0 }} className="t">{c.titulo}</span>
                  <Link className="btn small" href={`/novo-anuncio?peca=${c.id}`}>Anunciar no ML</Link>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="actions" style={{ marginTop: 14 }}>
          <Link className="btn" href="/estoque?filtro=rascunho">Ver rascunhos no Estoque</Link>
          <button className="btn" type="button" onClick={() => location.assign("/estoque/importar")}>Importar outro arquivo</button>
        </div>
      </div>
    );
  }

  return (
    <form action={acao}>
      <input
        type="hidden"
        name="dados"
        value={JSON.stringify(
          nota
            ? { tipo: "nfe", fornecedor, documento: nota.fornecedor.documento, chave: nota.chave, numero: nota.numero, itens: enviados }
            : { tipo: "planilha", fornecedor, colunas: mapa, itens: enviados },
        )}
      />
      <div className="panel">
        <h2>1. Escolha o arquivo</h2>
        <p className="muted" style={{ fontSize: ".84rem", marginTop: 4 }}>
          XML da NF-e de compra, ou planilha em CSV (no Excel: Salvar como &gt; CSV). A primeira linha da planilha tem de ser o cabeçalho.
        </p>
        <input type="file" accept=".xml,.csv,.txt,text/xml,text/csv" onChange={(e) => escolher(e.target.files?.[0])} style={{ marginTop: 10 }} aria-label="Arquivo do fornecedor" />
        {erro && <p className="trialbar bad" style={{ marginTop: 10 }}>{erro}</p>}
      </div>

      {(nota || planilha) && (
        <div className="panel">
          <h2>2. Confira</h2>
          <div className="form" style={{ marginTop: 8 }}>
            <div className="f s3">
              <label htmlFor="i-forn">Fornecedor</label>
              <input id="i-forn" list="i-fornecedores" value={fornecedor} onChange={(e) => mudarFornecedor(e.target.value)} required maxLength={120} placeholder="Nome do fornecedor" />
              <datalist id="i-fornecedores">
                {fornecedores.map((f) => (
                  <option key={f.nome} value={f.nome} />
                ))}
              </datalist>
              {nota && (
                <span className="hint">
                  Nota {nota.numero}
                  {nota.fornecedor.documento ? ` · CNPJ ${nota.fornecedor.documento}` : ""}
                </span>
              )}
            </div>
            <div className="f s3">
              <label htmlFor="i-min">Avisar quando sobrar (unidades)</label>
              <input id="i-min" name="minimo" type="number" min={0} step={1} value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder="Opcional, ex.: 2" />
              <span className="hint">Vale para os produtos deste arquivo. Vazio: sem aviso de estoque.</span>
            </div>
            {planilha &&
              CAMPOS.map((c) => (
                <div className="f s2" key={c}>
                  <label htmlFor={`i-${c}`}>
                    {NOMES_CAMPOS[c]}
                    {c === "titulo" ? " *" : ""}
                  </label>
                  <select id={`i-${c}`} value={mapa[c] ?? ""} onChange={(e) => setMapa((m) => ({ ...m, [c]: e.target.value || undefined }))}>
                    <option value="">Não tem</option>
                    {planilha.colunas.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>

          <div className="tablewrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Código</th>
                  <th>Código de barras</th>
                  <th className="num">Qtd.</th>
                  <th className="num">Custo</th>
                  {planilha && <th className="num">Venda</th>}
                </tr>
              </thead>
              <tbody>
                {itens.slice(0, 15).map((i, n) => (
                  <tr key={n}>
                    <td className="item">{i.titulo}</td>
                    <td>{i.codigo || "—"}</td>
                    <td>{i.ean || "—"}</td>
                    <td className="num">{i.quantidade}</td>
                    <td className="num">{reais(i.custoCentavos)}</td>
                    {planilha && <td className="num">{reais(i.precoCentavos)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: ".82rem", marginTop: 6 }}>
            {itens.length > 15 ? `Mostrando 15 de ${itens.length}. ` : ""}
            {itens.length > MAXIMO ? `Entram os ${MAXIMO} primeiros; importe o resto em outro arquivo. ` : ""}
            {planilha && !mapa.titulo ? "Escolha a coluna com o nome do produto." : ""}
          </p>
          {estado.erro && <p className="trialbar bad" style={{ marginTop: 10 }} role="alert">{estado.erro}</p>}
          <div className="actions" style={{ marginTop: 12 }}>
            <Enviar n={fornecedor.trim() ? enviados.length : 0} />
          </div>
        </div>
      )}
    </form>
  );
}
