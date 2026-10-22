"use client";
// Formulário do Novo anúncio, com a mesma disposição do protótipo: fotos à esquerda, dados à direita,
// canais embaixo com o que falta em cada um. As fotos sobem uma a uma (já reduzidas) para o ML.
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AtributoMl, Categoria } from "@/lib/ml-anuncio";
import { ficha as buscarFicha, salvarAnuncio, sugerir, type EstadoAnuncio } from "./acoes";

const CONDICOES = [
  ["nova_com_etiqueta", "Novo com etiqueta"],
  ["nova_sem_etiqueta", "Novo sem etiqueta"],
  ["seminova", "Seminovo"],
  ["usada_bom_estado", "Usado – bom estado"],
  ["usada_com_detalhes", "Usado – com detalhes"],
] as const;
const MAX_FOTOS = 8;
const TITULO_ML = 60;
const LADO_MAXIMO = 1600;

type Foto = { chave: string; previa: string; id?: string; url?: string; erro?: string };
type Ficha = {
  extras: AtributoMl[];
  pedeMarca: boolean;
  pedeCor: boolean;
  pedeTamanho: boolean;
  pedeGtin: boolean;
  razoesSemGtin: { id: string; nome: string }[];
};

// reduz para no máximo 1600 px no lado maior e JPEG: foto de celular cai de ~4 MB para ~300 KB
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

function Botoes({ podePublicar }: { podePublicar: boolean }) {
  const { pending, data } = useFormStatus();
  const qual = data?.get("acao");
  return (
    <div className="actions">
      <button className="btn" type="submit" name="acao" value="rascunho" disabled={pending}>
        {pending && qual === "rascunho" ? "Salvando…" : "Salvar rascunho"}
      </button>
      <button className="btn primary" type="submit" name="acao" value="publicar" disabled={pending || !podePublicar}>
        {pending && qual === "publicar" ? "Publicando no Mercado Livre…" : "Publicar"}
      </button>
    </div>
  );
}

export function Formulario({ conexoes }: { conexoes: { id: string; nome: string }[] }) {
  const [estado, acao] = useActionState(salvarAnuncio, {} as EstadoAnuncio);
  const [conexao, setConexao] = useState(conexoes[0].id);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [v, setV] = useState({ titulo: "", marca: "", cor: "", tamanho: "", condicao: "", ean: "", semGtin: "", descricao: "", preco: "", custo: "", quantidade: "1", caixa: "", tipo: "gold_special" });
  const [categorias, setCategorias] = useState<Categoria[] | null>(null);
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");
  const [buscando, setBuscando] = useState(false);
  const ultimoTitulo = useRef("");
  const [arrastando, setArrastando] = useState(false);

  const mudar = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function acharCategoria() {
    const t = v.titulo.trim();
    if (t.length < 3 || t === ultimoTitulo.current) return;
    ultimoTitulo.current = t;
    setBuscando(true);
    const r = await sugerir(conexao, t);
    setBuscando(false);
    if (r.erro) return setAviso(r.erro);
    setAviso("");
    setCategorias(r.categorias ?? []);
    if (!categoria && r.categorias?.[0]) escolher(r.categorias[0]);
  }

  async function escolher(c: Categoria) {
    setCategoria(c);
    setFicha(null);
    const r = await buscarFicha(conexao, c.id);
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
        corpo.append("conexao", conexao);
        const r = await fetch("/api/canais/mercado-livre/fotos", { method: "POST", body: corpo });
        const j = (await r.json().catch(() => ({}))) as { id?: string; url?: string; erro?: string };
        setFotos((x) => x.map((f) => (f.chave === chave ? { ...f, ...(r.ok ? { id: j.id, url: j.url } : { erro: j.erro ?? "Falhou" }) } : f)));
      } catch {
        setFotos((x) => x.map((f) => (f.chave === chave ? { ...f, erro: "Falhou" } : f)));
      }
    }
  }

  // depois de salvar, limpa para o próximo
  useEffect(() => {
    if (!estado.feito) return;
    setFotos([]);
    setV((x) => ({ ...x, titulo: "", marca: "", cor: "", tamanho: "", ean: "", semGtin: "", descricao: "", preco: "", custo: "", quantidade: "1", caixa: "" }));
    setCategorias(null);
    setCategoria(null);
    setFicha(null);
    setExtras({});
    ultimoTitulo.current = "";
  }, [estado.feito]);

  const enviadas = fotos.filter((f) => f.id && f.url);
  const subindo = fotos.some((f) => !f.id && !f.erro);
  const falta: [string, string][] = [];
  if (!v.titulo.trim()) falta.push(["block", "Falta o título"]);
  if (!(Number(v.preco.replace(",", ".")) > 0)) falta.push(["block", "Falta o preço"]);
  if (!enviadas.length) falta.push(["block", subindo ? "Esperando as fotos subirem" : "Falta pelo menos uma foto"]);
  if (!categoria) falta.push(["block", "Falta a categoria (sai do título)"]);
  if (!v.condicao) falta.push(["block", "Falta o estado da peça"]);
  if (ficha?.pedeMarca && !v.marca.trim()) falta.push(["block", "Falta a marca (ou \"Genérica\")"]);
  if (ficha?.pedeCor && !v.cor.trim()) falta.push(["block", "Falta a cor"]);
  if (ficha?.pedeTamanho && !v.tamanho.trim()) falta.push(["block", "Falta o tamanho"]);
  if (ficha?.pedeGtin && !v.ean && !v.semGtin) falta.push(["block", "Falta o código de barras ou o motivo de não ter"]);
  for (const a of ficha?.extras ?? []) if (!extras[a.id]?.trim()) falta.push(["block", `Falta: ${a.nome}`]);
  if (v.titulo.length > TITULO_ML) falta.push(["warn", `O título passa de ${TITULO_ML} caracteres: o ML pode recusar`]);
  if (subindo) falta.push(["info", "Fotos ainda subindo"]);
  const pronto = !falta.some(([t]) => t === "block") && !subindo;

  if (estado.feito) {
    const f = estado.feito;
    return (
      <div className="panel" style={{ maxWidth: 640 }}>
        <h2>{f.publicado ? "Publicado no Mercado Livre" : "Rascunho salvo"}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          <span className="tag">{f.sku}</span> {f.titulo}
        </p>
        <div className="actions" style={{ marginTop: 14 }}>
          {f.link && (
            <a className="btn primary" href={f.link} target="_blank" rel="noreferrer">
              Ver anúncio no ML
            </a>
          )}
          <Link className="btn" href="/estoque">
            Ver estoque
          </Link>
          <button className="btn" type="button" onClick={() => location.reload()}>
            Cadastrar outra peça
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={acao} className="nl">
      <input type="hidden" name="conexao" value={conexao} />
      <input type="hidden" name="fotos" value={JSON.stringify(enviadas.map((f) => ({ id: f.id, url: f.url })))} />
      <input type="hidden" name="categoria" value={categoria?.id ?? ""} />
      <input type="hidden" name="categoriaNome" value={categoria?.nome ?? ""} />

      <div>
        <div className="panel">
          <h2>Fotos</h2>
          <label
            className={`drop${arrastando ? " over" : ""}`}
            htmlFor="f-fotos"
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
            id="f-fotos"
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
          <div className="ai">
            <h3>Preencher com IA</h3>
            <p>Em breve o Claude olha as fotos e escreve título, detalhes, descrição e uma faixa de preço. Por enquanto, preencha à mão.</p>
          </div>
        </div>
      </div>

      <div>
        <div className="panel">
          <div className="form">
            <div className="f s6">
              <label htmlFor="f-titulo">Título</label>
              <input id="f-titulo" name="titulo" maxLength={200} required value={v.titulo} onChange={mudar("titulo")} onBlur={acharCategoria} placeholder="Ex.: Jaqueta jeans Levi's masculina azul M" />
              <span className="hint">
                {v.titulo.length}/{TITULO_ML} no Mercado Livre{buscando ? " · procurando a categoria…" : ""}
              </span>
            </div>
            <div className="f s6">
              <span className="lab">Categoria no Mercado Livre</span>
              {!categorias ? (
                <span className="hint">Escreva o título e saia do campo: o Mercado Livre sugere a categoria.</span>
              ) : categorias.length === 0 ? (
                <span className="hint">O ML não achou categoria para este título. Tente com mais detalhes (tipo da peça, marca).</span>
              ) : (
                <div className="chips">
                  {categorias.map((c) => (
                    <button key={c.id} type="button" className="chip" aria-pressed={categoria?.id === c.id} onClick={() => escolher(c)} title={c.dominio}>
                      {c.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="f s2">
              <label htmlFor="f-marca">Marca</label>
              <input id="f-marca" name="marca" value={v.marca} onChange={mudar("marca")} />
            </div>
            <div className="f s2">
              <label htmlFor="f-cond">Estado</label>
              <select id="f-cond" name="condicao" value={v.condicao} onChange={mudar("condicao")}>
                <option value="">Escolha…</option>
                {CONDICOES.map(([id, nome]) => (
                  <option key={id} value={id}>
                    {nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="f s2">
              <label htmlFor="f-tam">Tamanho</label>
              <input id="f-tam" name="tamanho" value={v.tamanho} onChange={mudar("tamanho")} placeholder="M, 42, 38" />
            </div>
            <div className="f s2">
              <label htmlFor="f-cor">Cor</label>
              <input id="f-cor" name="cor" value={v.cor} onChange={mudar("cor")} />
            </div>
            <div className="f s2">
              <label htmlFor="f-ean">EAN / código de barras</label>
              <input id="f-ean" name="ean" inputMode="numeric" value={v.ean} onChange={mudar("ean")} placeholder="Opcional" />
            </div>
            {ficha?.pedeGtin && !v.ean && ficha.razoesSemGtin.length > 0 && (
              <div className="f s2">
                <label htmlFor="f-semgtin">Sem código de barras porque</label>
                <select id="f-semgtin" name="semGtin" value={v.semGtin} onChange={mudar("semGtin")}>
                  <option value="">Escolha…</option>
                  {ficha.razoesSemGtin.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {ficha?.extras.map((a) => (
              <div className="f s2" key={a.id}>
                <label htmlFor={`a-${a.id}`}>{a.nome}</label>
                {a.valores.length > 0 && a.tipo !== "number_unit" ? (
                  <select id={`a-${a.id}`} name={`attr_${a.id}`} value={extras[a.id] ?? ""} onChange={(e) => setExtras((x) => ({ ...x, [a.id]: e.target.value }))}>
                    <option value="">Escolha…</option>
                    {a.valores.map((o) => (
                      <option key={o.id} value={`id:${o.id}`}>
                        {o.nome}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`a-${a.id}`}
                    name={`attr_${a.id}`}
                    value={extras[a.id] ?? ""}
                    onChange={(e) => setExtras((x) => ({ ...x, [a.id]: e.target.value }))}
                    placeholder={a.unidades.length ? `Ex.: 10 ${a.unidades[0]}` : undefined}
                  />
                )}
              </div>
            ))}

            <div className="f s6">
              <label htmlFor="f-desc">Descrição</label>
              <textarea id="f-desc" name="descricao" value={v.descricao} onChange={mudar("descricao")} placeholder="Medidas, detalhes, marcas de uso…" />
            </div>
            <div className="f s2">
              <label htmlFor="f-preco">Preço (R$)</label>
              <input id="f-preco" name="preco" inputMode="decimal" value={v.preco} onChange={mudar("preco")} placeholder="0,00" />
            </div>
            <div className="f s2">
              <label htmlFor="f-custo">Quanto você pagou</label>
              <input id="f-custo" name="custo" inputMode="decimal" value={v.custo} onChange={mudar("custo")} placeholder="Opcional" />
            </div>
            <div className="f s2">
              <label htmlFor="f-qtd">Quantidade</label>
              <input id="f-qtd" name="quantidade" type="number" min={1} step={1} value={v.quantidade} onChange={mudar("quantidade")} />
            </div>
            <div className="f s3">
              <label htmlFor="f-caixa">Caixa / prateleira</label>
              <input id="f-caixa" name="caixa" value={v.caixa} onChange={mudar("caixa")} placeholder="B-14" />
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>Canais</h2>
          <p className="muted" style={{ fontSize: ".84rem", marginTop: 4 }}>
            Cada canal confere as próprias regras antes de publicar. Hoje o Plist publica no Mercado Livre.
          </p>
          <div className="ready">
            <div className="rc" aria-pressed="true" style={{ cursor: "default" }}>
              <div className="top">
                <span className="nm">
                  <span className="chb st-live" style={{ ["--c" as string]: "var(--c-ml)" }}>ML</span>
                  Mercado Livre
                </span>
                <span className={`pill ${pronto ? "p-good" : "p-warn"}`}>{pronto ? "Pronto" : "Falta algo"}</span>
              </div>
              {conexoes.length > 1 && (
                <select className="btn small" value={conexao} onChange={(e) => setConexao(e.target.value)} aria-label="Conta do Mercado Livre">
                  {conexoes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              )}
              <select className="btn small" name="tipo" value={v.tipo} onChange={mudar("tipo")} aria-label="Tipo de anúncio">
                <option value="gold_special">Clássico</option>
                <option value="gold_pro">Premium (parcelado sem juros)</option>
              </select>
              <ul>
                {falta.map(([t, m]) => (
                  <li key={m} className={t}>
                    {m}
                  </li>
                ))}
                {!falta.length && <li className="info">Tudo certo para publicar</li>}
              </ul>
            </div>
            {[
              ["SP", "shopee", "Shopee"],
              ["SH", "shein", "Shein"],
              ["AZ", "amazon", "Amazon"],
              ["MG", "magalu", "Magalu"],
            ].map(([sigla, cor, nome]) => (
              <div className="rc" key={sigla} style={{ cursor: "default", opacity: 0.6 }}>
                <div className="top">
                  <span className="nm">
                    <span className="chb st-none" style={{ ["--c" as string]: `var(--c-${cor})` }}>{sigla}</span>
                    {nome}
                  </span>
                  <span className="pill p-muted">Em breve</span>
                </div>
              </div>
            ))}
          </div>
          {aviso && <p className="trialbar bad" style={{ marginTop: 12 }}>{aviso}</p>}
          {estado.erro && (
            <div className="trialbar bad" style={{ marginTop: 12, display: "block" }} role="alert">
              <b>{estado.erro}</b>
              {estado.causas?.map((c) => (
                <div key={c} style={{ marginTop: 4 }}>
                  {c}
                </div>
              ))}
            </div>
          )}
          <div className="publishbar">
            <span className="muted">{enviadas.length} {enviadas.length === 1 ? "foto" : "fotos"} · SKU gerado ao salvar</span>
            <Botoes podePublicar={pronto} />
          </div>
        </div>
      </div>
    </form>
  );
}
