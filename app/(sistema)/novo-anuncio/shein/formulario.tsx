"use client";
// Formulário de publicar uma peça na Shein: fotos da peça à esquerda, dados e o que a Shein exige à direita.
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AtributoShein, CategoriaShein, FichaShein } from "@/lib/shein-anuncio";
import { categorias as buscarCategorias, ficha as buscarFicha, publicarNaShein, type EstadoShein } from "./acoes";

const TITULO_SHEIN = 200;
const MAX_FOTOS = 10;

type Peca = {
  id: string;
  sku: string;
  titulo: string;
  descricao: string;
  marca: string;
  cor: string;
  tamanho: string;
  preco: string;
  quantidade: number;
  peso: number | null;
  comprimento: number | null;
  largura: number | null;
  altura: number | null;
  fotos: string[];
};

function Botao({ pronto }: { pronto: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending || !pronto}>
      {pending ? "Enviando para a Shein…" : "Publicar na Shein"}
    </button>
  );
}

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// valor da lista com o mesmo nome do que a peça já tem (ex.: cor "Preto"), para vir escolhido
const igual = (a: AtributoShein | null, nome: string) => (a && nome ? a.valores.find((v) => normal(v.nome) === normal(nome))?.id : undefined);

function Lista({ a, nome, valor, mudar }: { a: AtributoShein; nome: string; valor: string; mudar: (v: string) => void }) {
  return (
    <div className="f s2">
      <label htmlFor={`sh-${nome}`}>{a.nome}</label>
      {a.livre && !a.valores.length ? (
        <input id={`sh-${nome}`} name={nome} value={valor} onChange={(e) => mudar(e.target.value)} />
      ) : (
        <select id={`sh-${nome}`} name={nome} value={valor} onChange={(e) => mudar(e.target.value)}>
          <option value="">Escolha…</option>
          {a.valores.map((o) => (
            <option key={o.id} value={nome.startsWith("attr_") ? `id:${o.id}` : o.id}>
              {o.nome}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function FormularioShein({ loja, peca }: { loja: { id: string; nome: string }; peca: Peca }) {
  const [estado, acao] = useActionState(publicarNaShein, {} as EstadoShein);
  const [v, setV] = useState({
    titulo: peca.titulo.slice(0, TITULO_SHEIN),
    descricao: peca.descricao,
    preco: peca.preco,
    quantidade: String(peca.quantidade),
    peso: peca.peso ? String(peca.peso) : "",
    comprimento: peca.comprimento ? String(peca.comprimento) : "",
    largura: peca.largura ? String(peca.largura) : "",
    altura: peca.altura ? String(peca.altura) : "",
  });
  const [busca, setBusca] = useState(peca.titulo);
  const [opcoes, setOpcoes] = useState<CategoriaShein[] | null>(null);
  const [categoria, setCategoria] = useState<CategoriaShein | null>(null);
  const [ficha, setFicha] = useState<FichaShein | null>(null);
  const [cor, setCor] = useState("");
  const [tamanho, setTamanho] = useState("");
  const [marca, setMarca] = useState("");
  const [extras, setExtras] = useState<Record<number, string>>({});
  const [aviso, setAviso] = useState("");
  const [buscando, setBuscando] = useState(false);
  const ultima = useRef("");

  const mudar = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function procurar() {
    const t = busca.trim();
    if (t.length < 3 || t === ultima.current) return;
    ultima.current = t;
    setBuscando(true);
    const r = await buscarCategorias(loja.id, t);
    setBuscando(false);
    if (r.erro) return setAviso(r.erro);
    setAviso("");
    setOpcoes(r.categorias ?? []);
  }

  async function escolher(c: CategoriaShein) {
    setCategoria(c);
    setFicha(null);
    setExtras({});
    const r = await buscarFicha(loja.id, c.tipo);
    if (r.erro) return setAviso(r.erro);
    const f = r.ficha ?? null;
    setFicha(f);
    setCor(String(igual(f?.cor ?? null, peca.cor) ?? ""));
    setTamanho(String(igual(f?.tamanho ?? null, peca.tamanho) ?? ""));
    setMarca(f?.marcas.find((m) => normal(m.nome) === normal(peca.marca))?.codigo ?? "");
  }

  useEffect(() => {
    procurar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (estado.feito) {
    return (
      <div className="panel" style={{ maxWidth: 640 }}>
        <h2>Enviado para a Shein</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          <span className="tag">{estado.feito.sku}</span> {estado.feito.titulo}
        </p>
        <p className="muted" style={{ marginTop: 6 }}>
          A Shein analisa o produto antes de pôr na vitrine. Quando aprovar, o anúncio aparece como ativo depois de <b>Sincronizar anúncios</b> no Inventário.
        </p>
        <div className="actions" style={{ marginTop: 14 }}>
          <Link className="btn primary" href="/novo-anuncio/shein">
            Publicar outra peça
          </Link>
          <Link className="btn" href="/estoque">
            Ver estoque
          </Link>
        </div>
      </div>
    );
  }

  const falta: string[] = [];
  if (!v.titulo.trim()) falta.push("Falta o título");
  if (!(Number(v.preco.replace(/\./g, "").replace(",", ".")) > 0)) falta.push("Falta o preço");
  if (!peca.fotos.length) falta.push("A peça não tem foto");
  if (!categoria) falta.push("Falta a categoria");
  if (ficha && !ficha.cor) falta.push("Esta categoria não tem cor na Shein: escolha outra");
  if (ficha?.cor && !cor) falta.push(`Falta: ${ficha.cor.nome}`);
  if (ficha?.tamanho && !tamanho) falta.push(`Falta: ${ficha.tamanho.nome}`);
  for (const a of ficha?.obrigatorios ?? []) if (!extras[a.id]?.trim()) falta.push(`Falta: ${a.nome}`);
  if (!(Number(v.peso) > 0)) falta.push("Falta o peso com embalagem");
  if (!(Number(v.comprimento) > 0 && Number(v.largura) > 0 && Number(v.altura) > 0)) falta.push("Faltam as medidas do pacote");
  const pronto = falta.length === 0 && !!ficha;

  return (
    <form action={acao} className="nl">
      <input type="hidden" name="conexao" value={loja.id} />
      <input type="hidden" name="peca" value={peca.id} />
      <input type="hidden" name="categoria" value={categoria?.id ?? ""} />
      <input type="hidden" name="tipo" value={categoria?.tipo ?? ""} />
      <input type="hidden" name="corAtributo" value={ficha?.cor?.id ?? ""} />
      <input type="hidden" name="tamanhoAtributo" value={ficha?.tamanho?.id ?? ""} />

      <div>
        <div className="panel">
          <h2>Fotos da peça</h2>
          {peca.fotos.length ? (
            <div className="photos">
              {peca.fotos.slice(0, MAX_FOTOS).map((u) => (
                <figure key={u}>
                  <img src={u} alt="" />
                </figure>
              ))}
            </div>
          ) : (
            <p className="muted">Sem fotos. Cadastre as fotos da peça antes de publicar.</p>
          )}
          <p className="muted" style={{ fontSize: ".8rem", marginTop: 8 }}>
            Até {MAX_FOTOS} fotos vão para a Shein (ela pede de 900 a 2200 px). Loja: <b>{loja.nome}</b> · <span className="tag">{peca.sku}</span>
          </p>
        </div>
      </div>

      <div>
        <div className="panel">
          <div className="form">
            <div className="f s6">
              <label htmlFor="sh-titulo">Título</label>
              <input id="sh-titulo" name="titulo" maxLength={TITULO_SHEIN} required value={v.titulo} onChange={mudar("titulo")} />
            </div>
            <div className="f s6">
              <label htmlFor="sh-busca">Categoria na Shein</label>
              <input
                id="sh-busca"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onBlur={procurar}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    procurar();
                  }
                }}
                placeholder="Tipo da peça: vestido, tênis, bolsa…"
              />
              <span className="hint">{buscando ? "Procurando…" : "Escreva o tipo da peça e saia do campo."}</span>
              {opcoes && opcoes.length === 0 && <span className="hint">Nada encontrado. Tente uma palavra só, como “vestido”.</span>}
              {opcoes && opcoes.length > 0 && (
                <div className="chips">
                  {opcoes.map((c) => (
                    <button key={c.id} type="button" className="chip" aria-pressed={categoria?.id === c.id} onClick={() => escolher(c)}>
                      {c.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {ficha?.cor && <Lista a={ficha.cor} nome="cor" valor={cor} mudar={setCor} />}
            {ficha?.tamanho && <Lista a={ficha.tamanho} nome="tamanho" valor={tamanho} mudar={setTamanho} />}
            {ficha && ficha.marcas.length > 0 && (
              <div className="f s2">
                <label htmlFor="sh-marca">Marca</label>
                <select id="sh-marca" name="marca" value={marca} onChange={(e) => setMarca(e.target.value)}>
                  <option value="">Sem marca</option>
                  {ficha.marcas.map((m) => (
                    <option key={m.codigo} value={m.codigo}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="f s2">
              <label htmlFor="sh-preco">Preço (R$)</label>
              <input id="sh-preco" name="preco" inputMode="decimal" value={v.preco} onChange={mudar("preco")} />
            </div>
            <div className="f s2">
              <label htmlFor="sh-qtd">Quantidade</label>
              <input id="sh-qtd" name="quantidade" type="number" min={1} value={v.quantidade} onChange={mudar("quantidade")} />
            </div>

            {ficha?.obrigatorios.map((a) => (
              <Lista key={a.id} a={a} nome={`attr_${a.id}`} valor={extras[a.id] ?? ""} mudar={(x) => setExtras((e) => ({ ...e, [a.id]: x }))} />
            ))}

            <div className="f s2">
              <label htmlFor="sh-peso">Peso com embalagem (g)</label>
              <input id="sh-peso" name="peso" type="number" min={1} value={v.peso} onChange={mudar("peso")} />
            </div>
            <div className="f s2">
              <label htmlFor="sh-comp">Pacote: comprimento (cm)</label>
              <input id="sh-comp" name="comprimento" type="number" min={1} value={v.comprimento} onChange={mudar("comprimento")} />
            </div>
            <div className="f s2">
              <label htmlFor="sh-larg">Largura × altura (cm)</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input id="sh-larg" aria-label="Largura (cm)" name="largura" type="number" min={1} value={v.largura} onChange={mudar("largura")} />
                <input aria-label="Altura (cm)" name="altura" type="number" min={1} value={v.altura} onChange={mudar("altura")} />
              </div>
            </div>
            <div className="f s6">
              <label htmlFor="sh-desc">Descrição</label>
              <textarea id="sh-desc" name="descricao" rows={5} maxLength={5000} value={v.descricao} onChange={mudar("descricao")} />
            </div>
          </div>

          {falta.length > 0 && (
            <ul className="muted" style={{ fontSize: ".84rem", marginTop: 12 }}>
              {falta.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          {aviso && <p className="trialbar bad" style={{ marginTop: 12 }}>{aviso}</p>}
          {estado.erro && (
            <p className="trialbar bad" style={{ marginTop: 12 }} role="alert">
              {estado.erro}
            </p>
          )}
          <div className="publishbar">
            <span className="muted">É a mesma peça do estoque: vendeu em outro canal, o Plist zera o estoque dela na Shein.</span>
            <Botao pronto={pronto} />
          </div>
        </div>
      </div>
    </form>
  );
}
