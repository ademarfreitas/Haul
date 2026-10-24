import Link from "next/link";

// O que aparece no CRM para quem não está no plano Avançado.
export function Vitrine() {
  return (
    <>
      <header className="vhead">
        <div>
          <p className="eyebrow">Plano Avançado</p>
          <h1>CRM</h1>
          <p className="sub">Saiba quem compra de você, quem voltou e quem sumiu, sem digitar nada: tudo sai dos pedidos que o Plist já recebe.</p>
        </div>
      </header>
      <div className="emptybox">
        <p>
          <span className="pill p-accent">Só no plano Avançado</span>
        </p>
        <ul style={{ textAlign: "left", maxWidth: 480, margin: "14px auto 0", paddingLeft: 18 }}>
          <li>Todos os seus compradores, de todos os canais, num lugar só</li>
          <li>Quem está comprando de novo, quem é novo e quem sumiu</li>
          <li>Ficha de cada cliente com o que compra, anotações e próximo passo</li>
          <li>Funil de oportunidades e campanhas para os seus clientes próprios</li>
        </ul>
        <p style={{ marginTop: 16 }}>
          <Link className="btn primary" href="/minha-conta?aba=plano" style={{ textDecoration: "none" }}>
            Conhecer o plano Avançado
          </Link>
        </p>
      </div>
    </>
  );
}
