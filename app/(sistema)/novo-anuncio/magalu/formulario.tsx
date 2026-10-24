"use client";
// Formulário de publicar uma peça do estoque na Magalu: fotos da peça à esquerda, dados à direita.
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { publicarNaMagalu, type EstadoMagalu } from "./acoes";

const TITULO_MAGALU = 150;
const MAX_FOTOS = 10;

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

function Botao({ pronto }: { pronto: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending || !pronto}>
      {pending ? "Publicando na Magalu…" : "Publicar na Magalu"}
    </button>
  );
}

export function FormularioMagalu({ loja, peca }: { loja: { id: string; nome: string }; peca: Peca }) {
  const [estado, acao] = useActionState<EstadoMagalu, FormData>(publicarNaMagalu, {});
  const [v, setV] = useState({
    titulo: peca.titulo,
    descricao: peca.descricao,
    marca: peca.marca,
    ean: "",
    preco: peca.preco,
    quantidade: String(peca.quantidade),
    peso: peca.peso ? String(peca.peso) : "",
    comprimento: peca.comprimento ? String(peca.comprimento) : "",
    largura: peca.largura ? String(peca.largura) : "",
    altura: peca.altura ? String(peca.altura) : "",
  });
  const mudar = (campo: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [campo]: e.target.value }));

  if (estado.feito) {
    return (
      <div className="panel" style={{ maxWidth: 640 }}>
        <h2>Enviado para a Magalu</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          <span className="tag">{estado.feito.sku}</span> {estado.feito.titulo}
        </p>
        <p style={{ marginTop: 8 }}>A Magalu confere o anúncio antes de pôr no ar. Em <b>Inventário → Sincronizar anúncios</b> você vê quando ele entrar.</p>
        {estado.feito.aviso && <p className="trialbar bad" style={{ marginTop: 12 }}>{estado.feito.aviso}</p>}
        <div className="actions" style={{ marginTop: 14 }}>
          <Link className="btn primary" href="/novo-anuncio/magalu">
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
  if (v.descricao.trim().length < 10) falta.push("Falta a descrição");
  if (!v.marca.trim()) falta.push("Falta a marca (sem marca, use o nome da sua loja)");
  if (!(Number(v.preco.replace(/\./g, "").replace(",", ".")) > 0)) falta.push("Falta o preço");
  if (!peca.fotos.length) falta.push("A peça não tem foto");
  if (!(Number(v.peso) > 0)) falta.push("Falta o peso com embalagem");
  if (!(Number(v.comprimento) > 0 && Number(v.largura) > 0 && Number(v.altura) > 0)) falta.push("Faltam as medidas do pacote");
  const pronto = falta.length === 0;

  return (
    <form action={acao} className="nl">
      <input type="hidden" name="conexao" value={loja.id} />
      <input type="hidden" name="peca" value={peca.id} />

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
            Até {MAX_FOTOS} fotos vão para a Magalu. Loja: <b>{loja.nome}</b> · <span className="tag">{peca.sku}</span>
          </p>
        </div>
      </div>

      <div>
        <div className="panel">
          <div className="form">
            <div className="f s6">
              <label htmlFor="m-titulo">Título</label>
              <input id="m-titulo" name="titulo" maxLength={TITULO_MAGALU} required value={v.titulo} onChange={mudar("titulo")} />
              <span className="hint">
                {v.titulo.length}/{TITULO_MAGALU} na Magalu
              </span>
            </div>
            <div className="f s2">
              <label htmlFor="m-marca">Marca</label>
              <input id="m-marca" name="marca" value={v.marca} onChange={mudar("marca")} />
            </div>
            <div className="f s2">
              <label htmlFor="m-preco">Preço (R$)</label>
              <input id="m-preco" name="preco" inputMode="decimal" value={v.preco} onChange={mudar("preco")} />
            </div>
            <div className="f s2">
              <label htmlFor="m-qtd">Quantidade</label>
              <input id="m-qtd" name="quantidade" type="number" min={1} value={v.quantidade} onChange={mudar("quantidade")} />
            </div>
            <div className="f s2">
              <label htmlFor="m-ean">Código de barras (EAN)</label>
              <input id="m-ean" name="ean" inputMode="numeric" value={v.ean} onChange={mudar("ean")} placeholder="Opcional" />
            </div>
            <div className="f s2">
              <label htmlFor="m-peso">Peso com embalagem (g)</label>
              <input id="m-peso" name="peso" type="number" min={1} value={v.peso} onChange={mudar("peso")} />
            </div>
            <div className="f s2">
              <label htmlFor="m-comp">Pacote: comprimento (cm)</label>
              <input id="m-comp" name="comprimento" type="number" min={1} value={v.comprimento} onChange={mudar("comprimento")} />
            </div>
            <div className="f s2">
              <label htmlFor="m-larg">Largura × altura (cm)</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input id="m-larg" aria-label="Largura (cm)" name="largura" type="number" min={1} value={v.largura} onChange={mudar("largura")} />
                <input aria-label="Altura (cm)" name="altura" type="number" min={1} value={v.altura} onChange={mudar("altura")} />
              </div>
            </div>
            <div className="f s6">
              <label htmlFor="m-desc">Descrição</label>
              <textarea id="m-desc" name="descricao" rows={5} maxLength={5000} value={v.descricao} onChange={mudar("descricao")} />
            </div>
          </div>

          {falta.length > 0 && (
            <ul className="muted" style={{ fontSize: ".84rem", marginTop: 12 }}>
              {falta.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          {estado.erro && (
            <p className="trialbar bad" style={{ marginTop: 12 }} role="alert">
              {estado.erro}
            </p>
          )}
          <div className="publishbar">
            <span className="muted">É a mesma peça do estoque, agora com anúncio também na Magalu. O frete é o Magalu Entregas da sua loja.</span>
            <Botao pronto={pronto} />
          </div>
        </div>
      </div>
    </form>
  );
}
