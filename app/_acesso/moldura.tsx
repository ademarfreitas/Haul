import type { ReactNode } from "react";

// Moldura das telas de acesso: formulário à esquerda e, ao lado, um painel escuro com o que o Plist faz
// quando uma peça vende (no celular o painel some e fica só o formulário).
export function Moldura({ titulo, sub, selo, children }: { titulo: string; sub?: string; selo?: string; children: ReactNode }) {
  return (
    <div className="acesso">
      <section className="acesso-form">
        <div className="acesso-topo">
          <a href="/"><img src="/plist-logo.svg" alt="Plist" height={30} /></a>
          <a className="suave" href="/">← Voltar ao site</a>
        </div>
        <div className="acesso-meio">
          <div className="acesso-caixa">
            {selo && <p className="pilula">{selo}</p>}
            <h1>{titulo}</h1>
            {sub && <p className="suave">{sub}</p>}
            {children}
          </div>
        </div>
      </section>
      <aside className="acesso-lado" aria-hidden="true">
        <div className="lado-texto">
          <span>Um cadastro, seis marketplaces</span>
          <h2>Vendeu num canal, sai dos outros na hora.</h2>
          <p>O Plist cuida do trabalho repetido: anúncio, estoque, etiqueta oficial e o que falta até o dinheiro cair.</p>
        </div>
        <div className="lado-venda">
          <div className="lv-topo">
            <span className="lv-foto">JC</span>
            <span className="lv-nome">
              <b>Jaqueta Carhartt Detroit</b>
              <small>Vendida no Mercado Livre · R$ 690,00</small>
            </span>
            <span className="lv-selo">Vendido</span>
          </div>
          <ol>
            <li className="feito">Retirado da Shopee e do Facebook<small>2 s</small></li>
            <li className="feito">Etiqueta oficial pronta para imprimir<small>5 s</small></li>
            <li>Despachar até amanhã · Caixa A-07</li>
          </ol>
          <p className="lv-nota">Exemplo ilustrativo</p>
        </div>
      </aside>
    </div>
  );
}
