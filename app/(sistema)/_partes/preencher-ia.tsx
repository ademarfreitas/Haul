"use client";
// Caixa "Preencher com IA" do Novo anúncio (ML e Shopee). Reduz até 4 fotos para 768 px no navegador, manda com o
// que o lojista já escreveu e entrega a sugestão ao formulário, que decide o que trocar.
import { useEffect, useState } from "react";
import type { SugestaoIa } from "@/lib/ia-limites";

const FOTOS = 4;
const LADO = 768;

type Situacao = { pode: boolean; restam: number; limite: number; motivo: string };

async function reduzir(src: string): Promise<Blob | null> {
  try {
    const img = await createImageBitmap(await (await fetch(src)).blob());
    const escala = Math.min(1, LADO / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((ok) => canvas.toBlob((b) => ok(b), "image/jpeg", 0.8));
  } catch {
    return null; // foto de outro site que o navegador não deixa ler: segue sem ela
  }
}

export function PreencherComIA({ previas, dados, aoPreencher }: { previas: string[]; dados: Record<string, string>; aoPreencher: (s: SugestaoIa) => void }) {
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [notas, setNotas] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const [faltou, setFaltou] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/ia/anuncio")
      .then((r) => r.json())
      .then((j: Situacao) => setSituacao(j))
      .catch(() => setSituacao(null));
  }, []);

  async function gerar() {
    setGerando(true);
    setErro("");
    setFaltou([]);
    try {
      const corpo = new FormData();
      for (const p of previas.slice(0, FOTOS)) {
        const b = await reduzir(p);
        if (b) corpo.append("foto", b, "foto.jpg");
      }
      for (const [k, v] of Object.entries(dados)) if (v?.trim()) corpo.append(k, v);
      if (notas.trim()) corpo.append("notas", notas);
      const r = await fetch("/api/ia/anuncio", { method: "POST", body: corpo });
      const j = (await r.json().catch(() => ({}))) as { sugestao?: SugestaoIa; erro?: string; restam?: number };
      if (typeof j.restam === "number") setSituacao((s) => (s ? { ...s, restam: j.restam!, pode: s.pode && j.restam! > 0 } : s));
      if (!r.ok || !j.sugestao) return setErro(j.erro ?? "A IA não respondeu agora. Tente de novo.");
      aoPreencher(j.sugestao);
      setFaltou(j.sugestao.faltou);
    } catch {
      setErro("A IA não respondeu agora. Tente de novo.");
    } finally {
      setGerando(false);
    }
  }

  const semNada = !previas.length && !dados.titulo?.trim() && !notas.trim();
  return (
    <div className="ai">
      <h3>Preencher com IA</h3>
      <p>O Claude olha as fotos e escreve título, descrição, marca, cor, tamanho e estado. Confira tudo antes de publicar.</p>
      <textarea
        aria-label="O que não aparece na foto"
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        maxLength={1500}
        rows={2}
        placeholder="Opcional: o que não aparece na foto (medidas, tecido, defeito, voltagem…)"
        style={{ width: "100%", marginTop: 8, fontSize: ".84rem" }}
      />
      <div className="row2" style={{ alignItems: "center" }}>
        <button className="btn small primary" type="button" onClick={gerar} disabled={gerando || semNada || !situacao?.pode}>
          {gerando ? "Escrevendo…" : "Preencher com IA"}
        </button>
        {situacao && situacao.limite > 0 && (
          <span className="hint">
            {situacao.restam} de {situacao.limite} neste mês
          </span>
        )}
      </div>
      {situacao && !situacao.pode && situacao.motivo && <p className="ai-status">{situacao.motivo}</p>}
      {semNada && situacao?.pode && <p className="ai-status">Coloque uma foto ou escreva o título para começar.</p>}
      {erro && <p className="msg-erro" style={{ marginTop: 8, fontSize: ".82rem" }}>{erro}</p>}
      {faltou.length > 0 && (
        <p className="ai-status">
          Preenchido. A IA não conseguiu saber: {faltou.join("; ")}.
        </p>
      )}
    </div>
  );
}
