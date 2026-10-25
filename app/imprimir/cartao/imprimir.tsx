"use client";

export function Imprimir() {
  return (
    <button className="botao" type="button" onClick={() => window.print()} style={{ cursor: "pointer" }}>
      Imprimir
    </button>
  );
}
