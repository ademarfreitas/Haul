"use client";
// Formulário de publicar na Amazon: primeiro acha o produto no catálogo (vender num ASIN que já existe);
// se não houver, cria um produto novo com as fotos da peça e a ficha que o tipo de produto exige.
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { CampoAmazon, ProdutoCatalogo, TipoProduto } from "@/lib/amazon-anuncio";
import { campos as buscarCampos, procurar, publicarNaAmazon, tipos as buscarTipos, type EstadoAmazon } from "./acoes";

const TITULO_AMAZON = 200;
const MAX_FOTOS = 9;
const CONDICOES = [
  ["nova_com_etiqueta", "Novo com etiqueta"],
  ["nova_sem_etiqueta", "Novo sem etiqueta"],
  ["seminova", "Seminovo"],
  ["usada_bom_estado", "Usado – bom estado"],
  ["usada_com_detalhes", "Usado – com detalhes"],
] as const;

type Peca = {
  id: string;
  sku: string;
  titulo: string;
  descricao: string;
  marca: string;
  condicao: string;
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
      {pending ? "Publicando na Amazon…" : "Publicar na Amazon"}
    </button>
  );
}

// peca null: peça nova, que só pode ser oferta num produto do catálogo
export function FormularioAmazon({ loja, peca }: { loja: { id: string; nome: string }; peca: Peca | null }) {
  const [estado, acao] = useActionState(publicarNaAmazon, {} as EstadoAmazon);
  const [v, setV] = useState({
    busca: peca?.titulo ?? "",
    titulo: (peca?.titulo ?? "").slice(0, TITULO_AMAZON),
    descricao: peca?.descricao ?? "",
    marca: peca?.marca ?? "",
    ean: "",
    preco: peca?.preco ?? "",
    custo: "",
    condicao: peca?.condicao ?? "",
    nota: "",
    quantidade: String(peca?.quantidade ?? 1),
    peso: peca?.peso ? String(peca.peso) : "",
    comprimento: peca?.comprimento ? String(peca.comprimento) : "",
    largura: peca?.largura ? String(peca.largura) : "",
    altura: peca?.altura ? String(peca.altura) : "",
  });
  const [modo, setModo] = useState<"oferta" | "produto">("oferta");
  const [produtos, setProdutos] = useState<ProdutoCatalogo[] | null>(null);
  const [produto, setProduto] = useState<ProdutoCatalogo | null>(null);
  const [tiposSugeridos, setTipos] = useState<TipoProduto[] | null>(null);
  const [tipo, setTipo] = useState<TipoProduto | null>(null);
  const [ficha, setFicha] = useState<CampoAmazon[] | null>(null);
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");
  const [buscando, setBuscando] = useState(false);
  const ultimaBusca = useRef("");

  const mudar = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function buscar() {
    const t = v.busca.trim();
    if (t.length < 3 || t === ultimaBusca.current) return;
    ultimaBusca.current = t;
    setBuscando(true);
    const r = await procurar(loja.id, t);
    setBuscando(false);
    if (r.erro) return setAviso(r.erro);
    setAviso("");
    setProdutos(r.produtos ?? []);
  }

  async function produtoNovo() {
    setModo("produto");
    setProduto(null);
    if (tiposSugeridos) return;
    const r = await buscarTipos(loja.id, v.titulo);
    if (r.erro) return setAviso(r.erro);
    setTipos(r.tipos ?? []);
    if (r.tipos?.[0]) escolherTipo(r.tipos[0]);
  }

  async function escolherTipo(t: TipoProduto) {
    setTipo(t);
    setFicha(null);
    setExtras({});
    const r = await buscarCampos(loja.id, t.nome);
    if (r.erro) return setAviso(r.erro);
    setFicha(r.campos ?? []);
  }

  // peça do estoque: já procura pelo título dela
  useEffect(() => {
    if (peca) buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (estado.feito) {
    return (
      <div className="panel" style={{ maxWidth: 640 }}>
        <h2>Enviado para a Amazon</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          <span className="tag">{estado.feito.sku}</span> {estado.feito.titulo}
        </p>
        <p className="muted" style={{ marginTop: 6, fontSize: ".86rem" }}>
          A Amazon leva alguns minutos para pôr o anúncio no ar. Se ela pedir algum ajuste, aparece no Seller Central e na próxima sincronização do Inventário.
        </p>
        <div className="actions" style={{ marginTop: 14 }}>
          {estado.feito.link && (
            <a className="btn primary" href={estado.feito.link} target="_blank" rel="noreferrer">
              Ver produto na Amazon
            </a>
          )}
          <Link className="btn" href={peca ? "/novo-anuncio/amazon" : "/novo-anuncio/amazon?nova=1"}>
            {peca ? "Publicar outra peça" : "Cadastrar outra peça"}
          </Link>
          <Link className="btn" href="/estoque">
            Ver estoque
          </Link>
        </div>
      </div>
    );
  }

  const falta: string[] = [];
  if (!(Number(v.preco.replace(/\./g, "").replace(",", ".")) > 0)) falta.push("Falta o preço");
  if (!v.condicao) falta.push("Falta o estado da peça");
  if (modo === "oferta" && !produto) falta.push("Escolha o produto no catálogo (ou crie um produto novo)");
  if (modo === "produto") {
    if (!v.titulo.trim()) falta.push("Falta o título");
    if (!peca?.fotos.length) falta.push("A peça não tem foto");
    if (!tipo) falta.push("Falta o tipo de produto");
    for (const c of ficha ?? []) if (!extras[c.nome]?.trim()) falta.push(`Falta: ${c.rotulo}`);
    if (!(Number(v.peso) > 0)) falta.push("Falta o peso com embalagem");
    if (!(Number(v.comprimento) > 0 && Number(v.largura) > 0 && Number(v.altura) > 0)) falta.push("Faltam as medidas do pacote");
  }
  const pronto = falta.length === 0 && (modo === "oferta" || !!ficha);

  return (
    <form action={acao} className="nl">
      <input type="hidden" name="conexao" value={loja.id} />
      <input type="hidden" name="peca" value={peca?.id ?? ""} />
      <input type="hidden" name="modo" value={modo} />
      <input type="hidden" name="asin" value={produto?.asin ?? ""} />
      <input type="hidden" name="tipo" value={modo === "oferta" ? (produto?.tipo ?? "") : (tipo?.nome ?? "")} />
      <input type="hidden" name="imagem" value={produto?.imagem ?? ""} />
      {modo === "oferta" && <input type="hidden" name="titulo" value={produto?.titulo ?? ""} />}

      <div>
        <div className="panel">
          <h2>Produto no catálogo da Amazon</h2>
          <div className="form">
            <div className="f s6">
              <label htmlFor="a-busca">Procurar por título ou código de barras (EAN)</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  id="a-busca"
                  value={v.busca}
                  onChange={mudar("busca")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      buscar();
                    }
                  }}
                />
                <button type="button" className="btn" onClick={buscar}>
                  Procurar
                </button>
              </div>
              <span className="hint">{buscando ? "Procurando no catálogo…" : "Vender num produto que já existe é o caminho mais rápido na Amazon."}</span>
            </div>
          </div>
          {produtos && produtos.length === 0 && <p className="muted" style={{ marginTop: 8 }}>Nada no catálogo com essa busca.</p>}
          {produtos?.map((p) => (
            <div className="plat" key={p.asin} style={{ opacity: modo === "oferta" && produto && produto.asin !== p.asin ? 0.55 : 1 }}>
              <div className="nm" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {p.imagem && <img src={p.imagem} alt="" width={44} height={44} style={{ objectFit: "contain", borderRadius: 6 }} />}
                <span>
                  <b>{p.titulo}</b>
                  <small>
                    <span className="tag">{p.asin}</span> {p.marca ?? ""}
                  </small>
                </span>
              </div>
              <button
                type="button"
                className={`btn small${modo === "oferta" && produto?.asin === p.asin ? " primary" : ""}`}
                disabled={!p.tipo}
                title={p.tipo ? undefined : "A Amazon não informou o tipo deste produto"}
                onClick={() => {
                  setModo("oferta");
                  setProduto(p);
                  if (p.marca && !peca) setV((x) => ({ ...x, marca: p.marca ?? x.marca }));
                }}
              >
                {modo === "oferta" && produto?.asin === p.asin ? "Escolhido" : "Vender este"}
              </button>
            </div>
          ))}
          {peca ? (
            <p style={{ marginTop: 12 }}>
              <button type="button" className={`btn small${modo === "produto" ? " primary" : ""}`} onClick={produtoNovo} disabled={!peca.fotos.length}>
                Não achei: criar produto novo
              </button>
              {!peca.fotos.length && <span className="muted" style={{ fontSize: ".8rem" }}> (a peça precisa de foto)</span>}
            </p>
          ) : (
            <p className="muted" style={{ fontSize: ".8rem", marginTop: 12 }}>
              Peça nova aqui é sempre oferta num produto do catálogo. Para criar um produto novo, cadastre a peça com fotos no Novo anúncio e publique de lá.
            </p>
          )}
          {modo === "produto" && peca && peca.fotos.length > 0 && (
            <div className="photos" style={{ marginTop: 10 }}>
              {peca.fotos.slice(0, MAX_FOTOS).map((u) => (
                <figure key={u}>
                  <img src={u} alt="" />
                </figure>
              ))}
            </div>
          )}
          <p className="muted" style={{ fontSize: ".8rem", marginTop: 8 }}>
            Conta: <b>{loja.nome}</b>
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
            {modo === "produto" && (
              <>
                <div className="f s6">
                  <label htmlFor="a-titulo">Título</label>
                  <input id="a-titulo" name="titulo" maxLength={TITULO_AMAZON} value={v.titulo} onChange={mudar("titulo")} />
                  <span className="hint">
                    {v.titulo.length}/{TITULO_AMAZON} na Amazon
                  </span>
                </div>
                <div className="f s6">
                  <span className="lab">Tipo de produto na Amazon</span>
                  {!tiposSugeridos ? (
                    <span className="hint">Procurando o tipo pelo título…</span>
                  ) : tiposSugeridos.length === 0 ? (
                    <span className="hint">A Amazon não achou um tipo para este título. Tente com mais detalhes.</span>
                  ) : (
                    <div className="chips">
                      {tiposSugeridos.map((t) => (
                        <button key={t.nome} type="button" className="chip" aria-pressed={tipo?.nome === t.nome} onClick={() => escolherTipo(t)}>
                          {t.rotulo}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="f s2">
                  <label htmlFor="a-marca">Marca</label>
                  <input id="a-marca" name="marca" value={v.marca} onChange={mudar("marca")} placeholder="Genérico" />
                </div>
                <div className="f s2">
                  <label htmlFor="a-ean">Código de barras (EAN)</label>
                  <input id="a-ean" name="ean" inputMode="numeric" value={v.ean} onChange={mudar("ean")} placeholder="Opcional" />
                </div>
              </>
            )}
            {!peca && (
              <div className="f s2">
                <label htmlFor="a-marca2">Marca</label>
                <input id="a-marca2" name="marca" value={v.marca} onChange={mudar("marca")} />
              </div>
            )}
            <div className="f s2">
              <label htmlFor="a-preco">Preço (R$)</label>
              <input id="a-preco" name="preco" inputMode="decimal" value={v.preco} onChange={mudar("preco")} />
            </div>
            <div className="f s2">
              <label htmlFor="a-qtd">Quantidade</label>
              <input id="a-qtd" name="quantidade" type="number" min={1} value={v.quantidade} onChange={mudar("quantidade")} />
            </div>
            {!peca?.condicao && (
              <div className="f s2">
                <label htmlFor="a-cond">Estado</label>
                <select id="a-cond" name="condicao" value={v.condicao} onChange={mudar("condicao")}>
                  <option value="">Escolha…</option>
                  {CONDICOES.map(([id, nome]) => (
                    <option key={id} value={id}>
                      {nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!peca && (
              <div className="f s2">
                <label htmlFor="a-custo">Custo (R$)</label>
                <input id="a-custo" name="custo" inputMode="decimal" value={v.custo} onChange={mudar("custo")} placeholder="Opcional" />
              </div>
            )}
            {v.condicao && !v.condicao.startsWith("nova") && (
              <div className="f s6">
                <label htmlFor="a-nota">Observação do estado</label>
                <input id="a-nota" name="nota" maxLength={1000} value={v.nota} onChange={mudar("nota")} placeholder="Ex.: pequena marca de uso na manga" />
              </div>
            )}

            {modo === "produto" &&
              ficha?.map((c) => (
                <div className="f s2" key={c.nome}>
                  <label htmlFor={`aa-${c.nome}`} title={c.ajuda}>
                    {c.rotulo}
                  </label>
                  <input type="hidden" name={`amzt_${c.nome}`} value={[c.tipo, c.idioma ? "idioma" : ""].join(" ")} />
                  {c.tipo === "lista" || c.tipo === "simnao" ? (
                    <select id={`aa-${c.nome}`} name={`amz_${c.nome}`} value={extras[c.nome] ?? ""} onChange={(e) => setExtras((x) => ({ ...x, [c.nome]: e.target.value }))}>
                      <option value="">Escolha…</option>
                      {(c.tipo === "simnao" ? [{ valor: "sim", rotulo: "Sim" }, { valor: "nao", rotulo: "Não" }] : c.opcoes ?? []).map((o) => (
                        <option key={o.valor} value={o.valor}>
                          {o.rotulo}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`aa-${c.nome}`}
                      name={`amz_${c.nome}`}
                      inputMode={c.tipo === "numero" ? "decimal" : undefined}
                      value={extras[c.nome] ?? ""}
                      onChange={(e) => setExtras((x) => ({ ...x, [c.nome]: e.target.value }))}
                    />
                  )}
                  {c.unidades?.length ? (
                    <select aria-label={`Unidade de ${c.rotulo}`} name={`amzu_${c.nome}`} defaultValue={c.unidades[0]}>
                      {c.unidades.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              ))}

            {modo === "produto" && (
              <>
                <div className="f s2">
                  <label htmlFor="a-peso">Peso com embalagem (g)</label>
                  <input id="a-peso" name="peso" type="number" min={1} value={v.peso} onChange={mudar("peso")} />
                </div>
                <div className="f s2">
                  <label htmlFor="a-comp">Pacote: comprimento (cm)</label>
                  <input id="a-comp" name="comprimento" type="number" min={1} value={v.comprimento} onChange={mudar("comprimento")} />
                </div>
                <div className="f s2">
                  <label htmlFor="a-larg">Largura × altura (cm)</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input aria-label="Largura (cm)" name="largura" type="number" min={1} value={v.largura} onChange={mudar("largura")} />
                    <input aria-label="Altura (cm)" name="altura" type="number" min={1} value={v.altura} onChange={mudar("altura")} />
                  </div>
                </div>
                <div className="f s6">
                  <label htmlFor="a-desc">Descrição</label>
                  <textarea id="a-desc" name="descricao" rows={5} maxLength={2000} value={v.descricao} onChange={mudar("descricao")} />
                </div>
              </>
            )}
          </div>

          {falta.length > 0 && (
            <ul className="muted" style={{ fontSize: ".84rem", marginTop: 12 }}>
              {falta.map((t) => (
                <li key={t}>{t}</li>
              ))}
              {modo === "produto" && !v.ean.trim() && <li style={{ color: "var(--warn, inherit)" }}>Sem EAN, a sua conta precisa da isenção de código de barras aprovada pela Amazon</li>}
            </ul>
          )}
          {aviso && <p className="trialbar bad" style={{ marginTop: 12 }}>{aviso}</p>}
          {estado.erro && (
            <p className="trialbar bad" style={{ marginTop: 12 }} role="alert">
              {estado.erro}
            </p>
          )}
          <div className="publishbar">
            <span className="muted">
              {peca ? "É a mesma peça do estoque, agora com anúncio também na Amazon." : "A peça entra no estoque do Plist com SKU próprio."} Envio pelo DBA ou próprio, conforme a sua conta.
            </span>
            <Botao pronto={pronto} />
          </div>
        </div>
      </div>
    </form>
  );
}
