// Conferências dos dados do cadastro e dos primeiros passos. Tudo devolve só dígitos (ou E.164).

export const soDigitos = (s: string) => s.replace(/\D/g, "");

export function emailValido(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

export function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((t, p, i) => t + p * Number(cnpj[i]), 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(cnpj[12]) && dv(13) === Number(cnpj[13]);
}

// Celular brasileiro com DDD (11 dígitos, começa com 9 depois do DDD). Aceita +55 na frente.
export function celularE164(texto: string): string | null {
  let d = soDigitos(texto);
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (!/^[1-9][1-9]9\d{8}$/.test(d)) return null;
  return `+55${d}`;
}
