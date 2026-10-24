// Pedaços comuns das telas do CRM.

// AAAA-MM-DD → "14 de out. de 2026"
export const dataCurta = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
