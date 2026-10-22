import Link from "next/link";

// Tela do menu que ainda não foi trazida do protótipo para o sistema real.
export function EmBreve({ titulo, sub, oQueVem }: { titulo: string; sub: string; oQueVem: string[] }) {
  return (
    <>
      <header className="vhead">
        <div>
          <h1>{titulo}</h1>
          <p className="sub">{sub}</p>
        </div>
      </header>
      <div className="emptybox">
        <p>
          <span className="pill p-accent">Em construção</span>
        </p>
        <p style={{ marginTop: 10 }}>Esta tela está pronta no protótipo e chega ao sistema nas próximas atualizações.</p>
        <ul style={{ textAlign: "left", maxWidth: 460, margin: "12px auto 0", paddingLeft: 18 }}>
          {oQueVem.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p style={{ marginTop: 16 }}>
          <Link className="btn primary" href="/inventario" style={{ textDecoration: "none" }}>
            Ir para o Inventário
          </Link>
        </p>
      </div>
    </>
  );
}
