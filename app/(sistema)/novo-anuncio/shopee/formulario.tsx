"use client";
// Formulário de publicar uma peça na Shopee: fotos da peça à esquerda, dados e o que a Shopee exige à direita.
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AtributoShopee, CategoriaShopee, FreteShopee } from "@/lib/shopee-anuncio";
import { ficha as buscarFicha, publicarNaShopee, sugerir, type EstadoShopee } from "./acoes";

const TITULO_SHOPEE = 120;
const DESCRICAO_MINIMA = 20;
const MAX_FOTOS = 9;
const LADO_MAXIMO = 1600;
const CONDICOES = [
  ["nova_com_etiqueta", "Novo com etiqueta"],
  ["nova_sem_etiqueta", "Novo sem etiqueta"],
  ["seminova", "Seminovo"],
  ["usada_bom_estado", "Usado – bom estado"],
  ["usada_com_detalhes", "Usado – com detalhes"],
] as const;

type Foto = { chave: string; previa: string; id?: string; url?: string; erro?: string };

// reduz para no máximo 1600 px no lado maior e JPEG, como no Novo anúncio
async function reduzir(arquivo: File): Promise<Blob> {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error("foto"))), "image/jpeg", 0.86));
}

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

const normal = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

// peca null: peça nova, com fotos enviadas daqui direto para a Shopee
export function FormularioShopee({ loja, peca, fretes }: { loja: { id: string; nome: string }; peca: Peca | null; fretes: FreteShopee[] }) {
  const [estado, acao] = useActionState(publicarNaShopee, {} as EstadoShopee);
  const [v, setV] = useState({
    titulo: (peca?.titulo ?? "").slice(0, TITULO_SHOPEE),
    descricao: peca?.descricao ?? "",
    marca: peca?.marca ?? "",
    preco: peca?.preco ?? "",
    custo: "",
    condicao: "",
    quantidade: String(peca?.quantidade ?? 1),
    peso: peca?.peso ? String(peca.peso) : "",
    comprimento: peca?.comprimento ? String(peca.comprimento) : "",
    largura: peca?.largura ? String(peca.largura) : "",
    altura: peca?.altura ? String(peca.altura) : "",
  });
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [arrastando, setArrastando] = useState(false);
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

  async function adicionar(lista: FileList | null) {
    const novos = [...(lista ?? [])].filter((a) => a.type.startsWith("image/")).slice(0, MAX_FOTOS - fotos.length);
    for (const a of novos) {
      const chave = `${a.name}-${a.size}-${Math.random()}`;
      setFotos((x) => [...x, { chave, previa: URL.createObjectURL(a) }]);
      try {
        const corpo = new FormData();
        corpo.append("foto", await reduzir(a), "foto.jpg");
        corpo.append("conexao", loja.id);
        const r = await fetch("/api/canais/shopee/fotos", { method: "POST", body: corpo });
        const j = (await r.json().catch(() => ({}))) as { id?: string; url?: string; erro?: string };
        setFotos((x) => x.map((f) => (f.chave === chave ? { ...f, ...(r.ok ? { id: j.id, url: j.url } : { erro: j.erro ?? "Falhou" }) } : f)));
      } catch {
        setFotos((x) => x.map((f) => (f.chave === chave ? { ...f, erro: "Falhou" } : f)));
      }
    }
  }

  // peça do estoque: a categoria sai do título que já veio dela
  useEffect(() => {
    if (peca) acharCategoria();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const marca = ficha?.marcas.find((m) => normal(m.nome) === normal(v.marca));
  const falta: string[] = [];
  if (!v.titulo.trim()) falta.push("Falta o título");
  if (!(Number(v.preco.replace(/\./g, "").replace(",", ".")) > 0)) falta.push("Falta o preço");
  const enviadas = fotos.filter((f) => f.id);
  const subindo = fotos.some((f) => !f.id && !f.erro);
  if (peca ? !peca.fotos.length : !enviadas.length) falta.push(peca ? "A peça não tem foto" : subindo ? "Esperando as fotos subirem" : "Falta pelo menos uma foto");
  if (!peca && !v.condicao) falta.push("Falta o estado da peça");
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
      <input type="hidden" name="peca" value={peca?.id ?? ""} />
      <input type="hidden" name="fotos" value={JSON.stringify(enviadas.map((f) => ({ id: f.id, url: f.url ?? "" })))} />
      <input type="hidden" name="categoria" value={categoria?.id ?? ""} />
      <input type="hidden" name="categoriaNome" value={categoria?.nome ?? ""} />
      <input type="hidden" name="marcaId" value={marca?.id ?? 0} />

      <div>
        <div className="panel">
          <h2>{peca ? "Fotos da peça" : "Fotos"}</h2>
          {peca ? (
            peca.fotos.length ? (
              <div className="photos">
                {peca.fotos.slice(0, MAX_FOTOS).map((u) => (
                  <figure key={u}>
                    <img src={u} alt="" />
                  </figure>
                ))}
              </div>
            ) : (
              <p className="muted">Sem fotos. Cadastre as fotos da peça antes de publicar.</p>
            )
          ) : (
            <>
              <label
                className={`drop${arrastando ? " over" : ""}`}
                htmlFor="s-fotos"
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastando(false);
                  adicionar(e.dataTransfer.files);
                }}
              >
                Arraste as fotos ou <u>escolha os arquivos</u>
                <br />
                <span style={{ fontSize: ".78rem" }}>Até {MAX_FOTOS}. A primeira vira a capa.</span>
              </label>
              <input
                id="s-fotos"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  adicionar(e.target.files);
                  e.target.value = "";
                }}
              />
              {fotos.length > 0 && (
                <div className="photos">
                  {fotos.map((f) => (
                    <figure key={f.chave} title={f.erro ?? (f.id ? "Enviada" : "Enviando…")} style={{ opacity: f.id ? 1 : 0.5, outline: f.erro ? "2px solid var(--bad)" : undefined }}>
                      <img src={f.previa} alt="" />
                      <button type="button" aria-label="Tirar foto" onClick={() => setFotos((x) => x.filter((y) => y.chave !== f.chave))}>
                        ✕
                      </button>
                    </figure>
                  ))}
                </div>
              )}
              {fotos.some((f) => f.erro) && <p className="msg-erro" style={{ marginTop: 6, fontSize: ".8rem" }}>{fotos.find((f) => f.erro)?.erro}</p>}
            </>
          )}
          <p className="muted" style={{ fontSize: ".8rem", marginTop: 8 }}>
            Até {MAX_FOTOS} fotos vão para a Shopee. Loja: <b>{loja.nome}</b>
            {peca && (
              <>
                {" "}
                · <span className="tag">{peca.sku}</span>
              </>
            )}
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
                <span className="hint">{peca ? "Procurando a categoria pelo título…" : "Escreva o título e saia do campo: a Shopee sugere a categoria."}</span>
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
            {!peca && (
              <>
                <div className="f s2">
                  <label htmlFor="s-cond">Estado</label>
                  <select id="s-cond" name="condicao" value={v.condicao} onChange={mudar("condicao")}>
                    <option value="">Escolha…</option>
                    {CONDICOES.map(([id, nome]) => (
                      <option key={id} value={id}>
                        {nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="f s2">
                  <label htmlFor="s-custo">Custo (R$)</label>
                  <input id="s-custo" name="custo" inputMode="decimal" value={v.custo} onChange={mudar("custo")} placeholder="Opcional" />
                </div>
              </>
            )}

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
            <span className="muted">{peca ? "É a mesma peça do estoque, agora com anúncio também na Shopee." : "A peça entra no estoque do Plist com SKU próprio."}</span>
            <Botao pronto={pronto} />
          </div>
        </div>
      </div>
    </form>
  );
}
