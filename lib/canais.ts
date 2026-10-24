// Nomes, siglas e cores dos canais, iguais aos do protótipo. A chave é o enum `canal` do banco;
// `cor` é o sufixo da variável CSS (--c-ml, --c-shopee...) de app/(sistema)/sistema.css.
export const CANAIS = {
  mercado_livre: { nome: "Mercado Livre", sigla: "ML", cor: "ml", descricao: "Mercado Envios, Full e Flex" },
  shopee: { nome: "Shopee", sigla: "SP", cor: "shopee", descricao: "Logística integrada da Shopee" },
  shein: { nome: "Shein", sigla: "SH", cor: "shein", descricao: "Moda, calçados e casa · exige CNPJ" },
  amazon: { nome: "Amazon", sigla: "AZ", cor: "amazon", descricao: "Seller Central Brasil · DBA e FBA" },
  magalu: { nome: "Magalu", sigla: "MG", cor: "magalu", descricao: "Magalu Entregas · exige CNPJ" },
  facebook: { nome: "Facebook Marketplace", sigla: "FB", cor: "fb", descricao: "Classificados com retirada ou envio combinado" },
  venda_direta: { nome: "Venda direta", sigla: "VD", cor: "direta", descricao: "WhatsApp, Instagram, balcão" },
} as const;

export type Canal = keyof typeof CANAIS;

// Os que já falam com o marketplace de verdade. Os outros aparecem como "em breve".
export const CANAIS_PRONTOS: Canal[] = ["mercado_livre", "shopee", "shein"];

// rota que começa a conexão de cada canal pronto
export const CONECTAR: Partial<Record<Canal, string>> = {
  mercado_livre: "/api/canais/mercado-livre/conectar",
  shopee: "/api/canais/shopee/conectar",
  shein: "/api/canais/shein/conectar",
};

// textos para os códigos que o callback do ML devolve em ?ml_erro=
export const ERROS_ML: Record<string, string> = {
  access_denied: "Você não autorizou o Plist no Mercado Livre.",
  state_invalido: "A conexão expirou ou veio de outra aba. Tente de novo.",
  sem_sessao: "Entre na sua conta do Plist antes de conectar.",
  conta_fora_do_brasil: "Essa conta do Mercado Livre não é do Brasil.",
  conta_ja_conectada: "Essa conta do Mercado Livre já está ligada a outra conta do Plist.",
  invalid_client: "Client ID ou Secret do app do Mercado Livre não conferem (ver .env.local).",
  ml_indisponivel: "O Mercado Livre não respondeu. Tente de novo em alguns minutos.",
  invalid_grant: "O Mercado Livre recusou o código. Confira se o Redirect URI do app é igual ao ML_REDIRECT_URI.",
};

// textos para os códigos que o callback da Shopee devolve em ?shopee_erro=
export const ERROS_SHOPEE: Record<string, string> = {
  state_invalido: "A conexão expirou ou veio de outra aba. Tente de novo.",
  sem_sessao: "Entre na sua conta do Plist antes de conectar.",
  sem_loja: "A Shopee não informou qual loja foi autorizada. Tente de novo.",
  conta_principal: "Autorize uma loja específica, não a conta principal da Shopee.",
  conta_fora_do_brasil: "Essa loja da Shopee não é do Brasil.",
  conta_ja_conectada: "Essa loja da Shopee já está ligada a outra conta do Plist.",
  shopee_indisponivel: "A Shopee não respondeu. Tente de novo em alguns minutos.",
  error_sign: "A assinatura não conferiu: confira SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY (e o ambiente).",
  error_auth: "A Shopee recusou o código. Confira se o SHOPEE_REDIRECT_URI bate com o domínio cadastrado no console.",
};

// textos para os códigos que o callback (ou o formulário de chaves) da Shein devolve em ?shein_erro=
export const ERROS_SHEIN: Record<string, string> = {
  state_invalido: "A conexão expirou ou veio de outra aba. Tente de novo.",
  sem_sessao: "Entre na sua conta do Plist antes de conectar.",
  conta_ja_conectada: "Essa loja da Shein já está ligada a outra conta do Plist.",
  shein_indisponivel: "A Shein não respondeu. Tente de novo em alguns minutos.",
  chaves_vazias: "Cole o open key ID e a secret key da sua loja.",
  chaves_recusadas: "A Shein recusou essas chaves. Confira se copiou as duas inteiras.",
  sem_chaves: "A Shein não devolveu as chaves da loja. Tente de novo.",
  chave_ilegivel: "Não deu para abrir a chave da loja: confira o SHEIN_APP_SECRET.",
};

export function reais(centavos: number | null | undefined): string {
  if (centavos == null) return "—";
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
