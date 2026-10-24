// Criar anúncio no Mercado Livre: sugestão de categoria, ficha técnica obrigatória, fotos, taxa e publicação.
// Docs: https://developers.mercadolivre.com.br/pt-br/publicacao-de-produtos
//       https://developers.mercadolivre.com.br/pt-br/preditor-de-categorias
import { chamarApi, ErroMl } from "@/lib/mercado-livre";

export type Categoria = { id: string; nome: string; dominio: string };

export type AtributoMl = {
  id: string;
  nome: string;
  tipo: string; // string, number, number_unit, list, boolean
  valores: { id: string; nome: string }[];
  unidades: string[];
};

// Atributos que o formulário já cobre com campo próprio
export const ATRIBUTOS_DO_FORMULARIO = ["BRAND", "COLOR", "SIZE", "GTIN", "SELLER_SKU", "ITEM_CONDITION", "EMPTY_GTIN_REASON"];

export const TIPOS_ANUNCIO = {
  gold_special: "Clássico",
  gold_pro: "Premium",
} as const;
export type TipoAnuncio = keyof typeof TIPOS_ANUNCIO;

type Descoberta = { domain_id: string; domain_name: string; category_id: string; category_name: string }[];

export async function sugerirCategorias(token: string, titulo: string): Promise<Categoria[]> {
  const r = await chamarApi<Descoberta>(`/sites/MLB/domain_discovery/search?limit=4&q=${encodeURIComponent(titulo)}`, token);
  const vistas = new Set<string>();
  return r
    .filter((c) => c.category_id && !vistas.has(c.category_id) && vistas.add(c.category_id))
    .map((c) => ({ id: c.category_id, nome: c.category_name, dominio: c.domain_name }));
}

type AtributoBruto = {
  id: string;
  name: string;
  value_type: string;
  tags?: Record<string, boolean>;
  values?: { id: string; name: string }[];
  allowed_units?: { id: string; name: string }[];
};

// Ficha técnica que a categoria exige (tags.required), mais a "razão de não ter código de barras",
// que entra quando o GTIN é pedido e a peça não tem.
export async function atributosObrigatorios(token: string, categoriaId: string) {
  if (!/^MLB\d+$/.test(categoriaId)) throw new ErroMl(400, "categoria_invalida", "Categoria inválida.");
  const todos = await chamarApi<AtributoBruto[]>(`/categories/${categoriaId}/attributes`, token);
  const converter = (a: AtributoBruto): AtributoMl => ({
    id: a.id,
    nome: a.name,
    tipo: a.value_type,
    valores: (a.values ?? []).map((v) => ({ id: v.id, nome: v.name })),
    unidades: (a.allowed_units ?? []).map((u) => u.name),
  });
  const obrigatorios = todos.filter((a) => a.tags?.required || a.tags?.catalog_required).map(converter);
  const semGtin = todos.find((a) => a.id === "EMPTY_GTIN_REASON");
  return {
    extras: obrigatorios.filter((a) => !ATRIBUTOS_DO_FORMULARIO.includes(a.id)),
    pedeMarca: obrigatorios.some((a) => a.id === "BRAND"),
    pedeCor: obrigatorios.some((a) => a.id === "COLOR"),
    pedeTamanho: obrigatorios.some((a) => a.id === "SIZE"),
    // o GTIN costuma vir como "condicional": obrigatório quando o produto tem código, com o motivo como saída
    pedeGtin: todos.some((a) => a.id === "GTIN" && (a.tags?.required || a.tags?.conditional_required)),
    razoesSemGtin: semGtin ? converter(semGtin).valores : [],
  };
}

type FotoEnviada = { id: string; variations?: { size?: string; secure_url?: string; url?: string }[] };

// A foto fica guardada no próprio ML; devolve o id (para o anúncio) e o endereço da maior versão (para o Plist).
export async function enviarFoto(token: string, arquivo: Blob, nome: string) {
  const form = new FormData();
  form.append("file", arquivo, nome);
  const r = await chamarApi<FotoEnviada>("/pictures/items/upload", token, { metodo: "POST", form });
  const maior = (r.variations ?? [])
    .map((v) => ({ url: v.secure_url ?? v.url ?? "", area: (v.size ?? "0x0").split("x").reduce((a, b) => a * Number(b || 0), 1) }))
    .sort((a, b) => b.area - a.area)[0];
  return { id: r.id, url: maior?.url ?? "" };
}

type Preco = { sale_fee_amount?: number; listing_type_id?: string };

// Taxa de venda que o ML cobraria neste preço, categoria e tipo de anúncio (o 1º dos três momentos da taxa).
export async function taxaEstimada(token: string, precoCentavos: number, categoriaId: string, tipo: TipoAnuncio): Promise<number | null> {
  try {
    const r = await chamarApi<Preco | Preco[]>(
      `/sites/MLB/listing_prices?price=${(precoCentavos / 100).toFixed(2)}&category_id=${categoriaId}&listing_type_id=${tipo}`,
      token,
    );
    const p = Array.isArray(r) ? r.find((x) => x.listing_type_id === tipo) : r;
    return p?.sale_fee_amount != null ? Math.round(p.sale_fee_amount * 100) : null;
  } catch {
    return null; // a estimativa não pode impedir a publicação
  }
}

export type NovoItem = {
  titulo: string;
  categoriaId: string;
  precoCentavos: number;
  quantidade: number;
  condicao: "new" | "used";
  tipo: TipoAnuncio;
  fotos: string[]; // ids das fotos enviadas
  atributos: { id: string; value_id?: string; value_name?: string }[];
  descricao: string;
};

type ItemCriado = { id: string; permalink: string; status: string };

export async function publicarItem(token: string, n: NovoItem): Promise<ItemCriado> {
  const corpo = {
    title: n.titulo,
    category_id: n.categoriaId,
    price: n.precoCentavos / 100,
    currency_id: "BRL",
    available_quantity: n.quantidade,
    buying_mode: "buy_it_now",
    condition: n.condicao,
    listing_type_id: n.tipo,
    pictures: n.fotos.map((id) => ({ id })),
    attributes: n.atributos,
  };
  let item: ItemCriado;
  try {
    item = await chamarApi<ItemCriado>("/items", token, { metodo: "POST", json: corpo });
  } catch (e) {
    // contas no modelo "produto do vendedor" (User Products) recebem family_name no lugar de title
    if (!(e instanceof ErroMl) || !/family_name/i.test([e.message, ...e.causas].join(" "))) throw e;
    const { title, ...resto } = corpo;
    item = await chamarApi<ItemCriado>("/items", token, { metodo: "POST", json: { ...resto, family_name: title } });
  }
  if (n.descricao.trim()) {
    // o anúncio já está no ar: se a descrição falhar, segue e avisa
    await chamarApi(`/items/${item.id}/description`, token, { metodo: "POST", json: { plain_text: n.descricao.trim() } }).catch((e) =>
      console.error("descrição do ML falhou:", e instanceof ErroMl ? e.codigo : e),
    );
  }
  return item;
}

// Por que a conta não pode anunciar ("seller.unable_to_list"): o /users/me traz status.list com os códigos.
// Os códigos não têm lista oficial; o texto sai pelo pedaço reconhecido, e o código cru fica no fim.
type StatusMl = { allow?: boolean; codes?: string[] };
type UsuarioComStatus = {
  status?: { list?: StatusMl; sell?: StatusMl; mercadoenvios?: string; confirmed_email?: boolean; site_status?: string };
};

const PENDENCIAS: [RegExp, string][] = [
  [/email/, "Confirme o e-mail da conta do Mercado Livre."],
  [/phone|telefone/, "Cadastre e confirme um telefone na conta do Mercado Livre."],
  [/address|adress|zip|endereco/, "Complete o endereço da conta do Mercado Livre (é de onde as vendas saem)."],
  [/identi|kyc|document|cpf|cnpj|doc_/, "Valide sua identidade no Mercado Livre (documento e selfie, em Meu perfil)."],
  [/billing|fiscal|tax|invoice/, "Complete os dados fiscais e de faturamento no Mercado Livre."],
  [/mercadoenvios|shipping|me2/, "Aceite o Mercado Envios na conta do Mercado Livre."],
  [/blocked|block|restrict|suspend|penalt|fraud|inactive|deactivat/, "A conta está com restrição no Mercado Livre. Veja o aviso em Minha conta no site do ML ou fale com o atendimento deles."],
];

export function textoPendencia(codigo: string): string {
  const c = codigo.toLowerCase();
  return PENDENCIAS.find(([re]) => re.test(c))?.[1] ?? `Pendência na conta do Mercado Livre (${codigo}).`;
}

export async function pendenciasVendedor(token: string): Promise<{ podeAnunciar: boolean | null; codigos: string[]; textos: string[] }> {
  const u = await chamarApi<UsuarioComStatus>("/users/me", token);
  const st = u.status ?? {};
  const codigos = [...new Set([...(st.list?.codes ?? []), ...(st.sell?.codes ?? [])])];
  if (st.confirmed_email === false) codigos.push("email_not_confirmed");
  if (st.mercadoenvios === "not_accepted") codigos.push("mercadoenvios_not_accepted");
  if (st.site_status && st.site_status !== "active") codigos.push(`site_status_${st.site_status}`);
  const textos = [...new Set(codigos.map(textoPendencia))];
  return { podeAnunciar: st.list?.allow ?? null, codigos, textos };
}
