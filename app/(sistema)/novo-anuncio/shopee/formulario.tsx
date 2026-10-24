"use client";
// Formulário de publicar uma peça na Shopee: fotos da peça à esquerda, dados e o que a Shopee exige à direita.
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AtributoShopee, CategoriaShopee, FreteShopee } from "@/lib/shopee-anuncio";
import { ficha as buscarFicha, publicarNaShopee, sugerir, type EstadoShopee } from "./acoes";

const TITULO_SHOPEE = 120;
const DESCRICAO_MINIMA = 20;

type Peca = {
  id: string;
  sku: string;
  titulo: string;
  descricao: string;
  marca: string;
  preco: string;
  quantidade: number;
  peso: number | null;
  comprimento: number | null;
  largura: number | null;
  altura: number | null;
  fotos: string[];
};
type Ficha = { atributos: AtributoShopee[]; marcas: { id: number; nome: string }[]; pedeMarca: boolean };

function Botao({ pronto }: { pronto: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending || !pronto}>
      {pending ? "Publicando na Shopee…" : "Publicar na Shopee"}
    </button>
  );
}

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export function FormularioShopee({ loja, peca, fretes }: { loja: { id: string; nome: string }; peca: Peca; fretes: FreteShopee[] }) {
  const [estado, acao] = useActionState(publicarNaShopee, {} as EstadoShopee);
  const [v, setV] = useState({
    titulo: peca.titulo.slice(0, TITULO_SHOPEE),
    descricao: peca.descricao,
    marca: peca.marca,
    preco: peca.preco,
    quantidade: String(peca.quantidade),
    peso: peca.peso ? String(peca.peso) : "",
    comprimento: peca.comprimento ? String(peca.comprimento) : "",
    largura: peca.largura ? String(peca.largura) : "",
    altura: peca.altura ? String(peca.altura) : "",
  });
  const [categorias, setCategorias] = useState<CategoriaShopee[] | null>(null);
  const [categoria, setCategoria] = useState<CategoriaShopee | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [extras, setExtras] = useState<Record<number, string>>({});
  const [escolhidos, setEscolhidos] = useState<number[]>(fretes.map((f) => f.id));
  const [aviso, setAviso] = useState("");
  const [buscando, setBuscando] = useState(false);
  const ultimoTitulo = useRef("");

  const mudar = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function acharCategoria() {
    const t = v.titulo.trim();
    if (t.length < 3 || t === ultimoTitulo.current) return;
    ultimoTitulo.current = t;
    setBuscando(true);
    const r = await sugerir(loja.id, t);
    setBuscando(false);
    if (r.erro) return setAviso(r.erro);
    setAviso("");
    setCategorias(r.categorias ?? []);
    if (!categoria && r.categorias?.[0]) escolher(r.categorias[0]);
  }

  async function escolher(c: CategoriaShopee) {
    setCategoria(c);
    setFicha(null);
    setExtras({});
    const r = await buscarFicha(loja.id, c.id);
    if (r.erro) return setAviso(r.erro);
    setFicha(r.ficha ?? null);
  }

  // a categoria sai do título que já veio da peça
  useEffect(() => {
    acharCategoria();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (estado.feito) {
    return (
      <div className="panel" style={{ maxWidth: 640 }}>
        <h2>Publicado na Shopee</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          <span className="tag">{peca.sku}</span> {estado.feito.titulo}
        </p>
        <div className="actions" style={{ marginTop: 14 }}>
          <a className="btn primary" href={estado.feito.link} target="_blank" rel="noreferrer">
            Ver anúncio na Shopee
          </a>
          <Link className="btn" href="/novo-anuncio/shopee">
            Publicar outra peça
          </Link>
          <Link className="btn" href="/estoque">
            Ver estoque
          </Link>
        </div>
      </div>
    );
  }

  const marca = ficha?.marcas.find((m) => normal(m.nome) === normal(v.marca));
  const falta: string[] = [];
  if (!v.titulo.trim()) falta.push("Falta o título");
  if (!(Number(v.preco.replace(/\./g, "").replace(",", ".")) > 0)) falta.push("Falta o preço");
  if (!peca.fotos.length) falta.push("A peça não tem foto");
  if (!categoria) falta.push("Falta a categoria (sai do título)");
  if (ficha?.pedeMarca && !marca) falta.push("A Shopee pede uma marca da lista dela");
  for (const a of ficha?.atributos ?? []) if (!extras[a.id]?.trim()) falta.push(`Falta: ${a.nome}`);
  if (!(Number(v.peso) > 0)) falta.push("Falta o peso com embalagem");
  if (!(Number(v.comprimento) > 0 && Number(v.largura) > 0 && Number(v.altura) > 0)) falta.push("Faltam as medidas do pacote");
  if (!escolhidos.length) falta.push("Escolha pelo menos uma forma de envio");
  const pronto = falta.length === 0 && !!ficha;
  const avisos: string[] = [];
  if (v.descricao.trim().length < DESCRICAO_MINIMA) avisos.push("Descrição curta: a Shopee pode recusar");
  if (v.marca.trim() && ficha && !marca) avisos.push("Marca fora da lista da Shopee: o anúncio sai sem marca");

  return (
    <form action={acao} className="nl">
      <input type="hidden" name="conexao" value={loja.id} />
      <input type="hidden" name="peca" value={peca.id} />
      <input type="hidden" name="categoria" value={categoria?.id ?? ""} />
      <input type="hidden" name="marcaId" value={marca?.id ?? 0} />

      <div>
        <div className="panel">
          <h2>Fotos da peça</h2>
          {peca.fotos.length ? (
            <div className="photos">
              {peca.fotos.slice(0, 9).map((u) => (
                <figure key={u}>
                  <img src={u} alt="" />
                </figure>
              ))}
            </div>
          ) : (
            <p className="muted">Sem fotos. Cadastre as fotos da peça antes de publicar.</p>
          )}
          <p className="muted" style={{ fontSize: ".8rem", marginTop: 8 }}>
            Até 9 fotos sobem para a Shopee. Loja: <b>{loja.nome}</b> · <span className="tag">{peca.sku}</span>
          </p>
        </div>
      </div>

      <div>
        <div className="panel">
          <div className="form">
            <div className="f s6">
              <label htmlFor="s-titulo">Título</label>
              <input id="s-titulo" name="titulo" maxLength={TITULO_SHOPEE} required value={v.titulo} onChange={mudar("titulo")} onBlur={acharCategoria} />
              <span className="hint">
                {v.titulo.length}/{TITULO_SHOPEE} na Shopee{buscando ? " · procurando a categoria…" : ""}
              </span>
            </div>
            <div className="f s6">
              <span className="lab">Categoria na Shopee</span>
              {!categorias ? (
                <span className="hint">Procurando a categoria pelo título…</span>
              ) : categorias.length === 0 ? (
                <span className="hint">A Shopee não achou categoria para este título. Tente com mais detalhes (tipo da peça, marca).</span>
              ) : (
                <div className="chips">
                  {categorias.map((c) => (
                    <button key={c.id} type="button" className="chip" aria-pressed={categoria?.id === c.id} onClick={() => escolher(c)}>
                      {c.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="f s2">
              <label htmlFor="s-marca">Marca</label>
              <input id="s-marca" name="marca" list="s-marcas" value={v.marca} onChange={mudar("marca")} />
              <datalist id="s-marcas">
                {ficha?.marcas.map((m) => <option key={m.id} value={m.nome} />)}
              </datalist>
            </div>
            <div className="f s2">
              <label htmlFor="s-preco">Preço (R$)</label>
              <input id="s-preco" name="preco" inputMode="decimal" value={v.preco} onChange={mudar("preco")} />
            </div>
            <div className="f s2">
              <label htmlFor="s-qtd">Quantidade</label>
              <input id="s-qtd" name="quantidade" type="number" min={1} value={v.quantidade} onChange={mudar("quantidade")} />
            </div>

            {ficha?.atributos.map((a) => (
              <div className="f s2" key={a.id}>
                <label htmlFor={`sa-${a.id}`}>{a.nome}</label>
                {a.valores.length > 0 && (a.tipo === "DROP_DOWN" || a.tipo === "MULTIPLE_SELECT") ? (
                  <select id={`sa-${a.id}`} name={`attr_${a.id}`} value={extras[a.id] ?? ""} onChange={(e) => setExtras((x) => ({ ...x, [a.id]: e.target.value }))}>
                    <option value="">Escolha…</option>
                    {a.valores.map((o) => (
                      <option key={o.id} value={`id:${o.id}`}>
                        {o.nome}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      id={`sa-${a.id}`}
                      name={`attr_${a.id}`}
                      list={a.valores.length ? `sl-${a.id}` : undefined}
                      value={(extras[a.id] ?? "").replace(/^id:\d+$/, (x) => a.valores.find((o) => `id:${o.id}` === x)?.nome ?? "")}
                      onChange={(e) => {
                        const o = a.valores.find((x) => normal(x.nome) === normal(e.target.value));
                        setExtras((x) => ({ ...x, [a.id]: o ? `id:${o.id}` : e.target.value }));
                      }}
                    />
                    {a.valores.length > 0 && (
                      <datalist id={`sl-${a.id}`}>
                        {a.valores.map((o) => <option key={o.id} value={o.nome} />)}
                      </datalist>
                    )}
                    {a.unidade && <input type="hidden" name={`unid_${a.id}`} value={a.unidade} />}
                  </>
                )}
              </div>
            ))}

            <div className="f s2">
              <label htmlFor="s-peso">Peso com embalagem (g)</label>
              <input id="s-peso" name="peso" type="number" min={1} value={v.peso} onChange={mudar("peso")} />
            </div>
            <div className="f s2">
              <label htmlFor="s-comp">Pacote: comprimento (cm)</label>
              <input id="s-comp" name="comprimento" type="number" min={1} value={v.comprimento} onChange={mudar("comprimento")} />
            </div>
            <div className="f s2">
              <label htmlFor="s-larg">Largura × altura (cm)</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input aria-label="Largura (cm)" name="largura" type="number" min={1} value={v.largura} onChange={mudar("largura")} />
                <input aria-label="Altura (cm)" name="altura" type="number" min={1} value={v.altura} onChange={mudar("altura")} />
              </div>
            </div>
            <div className="f s6">
              <label htmlFor="s-desc">Descrição</label>
              <textarea id="s-desc" name="descricao" rows={5} maxLength={5000} value={v.descricao} onChange={mudar("descricao")} />
            </div>
            <div className="f s6">
              <span className="lab">Formas de envio</span>
              {fretes.length === 0 ? (
                <span className="hint">Nenhuma forma de envio ligada na loja. Ative uma no Seller Centre da Shopee.</span>
              ) : (
                <div className="chips">
                  {fretes.map((fr) => (
                    <label key={fr.id} className="chip" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        name="frete"
                        value={fr.id}
                        checked={escolhidos.includes(fr.id)}
                        onChange={(e) => setEscolhidos((x) => (e.target.checked ? [...x, fr.id] : x.filter((y) => y !== fr.id)))}
                      />{" "}
                      {fr.nome}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {(falta.length > 0 || avisos.length > 0) && (
            <ul className="muted" style={{ fontSize: ".84rem", marginTop: 12 }}>
              {falta.map((t) => (
                <li key={t}>{t}</li>
              ))}
              {avisos.map((t) => (
                <li key={t} style={{ color: "var(--warn, inherit)" }}>
                  {t}
                </li>
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
            <span className="muted">É a mesma peça do estoque, agora com anúncio também na Shopee.</span>
            <Botao pronto={pronto} />
          </div>
        </div>
      </div>
    </form>
  );
}
