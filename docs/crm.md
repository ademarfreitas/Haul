# CRM do Plist

Módulo do plano **Avançado** (no teste grátis de 30 dias fica liberado para todos, como o resto). Menu
**Análise → CRM**; nos outros planos a tela mostra a vitrine com o botão para o plano. A trava está em
`temCrm()` (`lib/crm.ts`) e vale em toda página e ação do CRM, não só no menu.

Inspirado no CRM do Zappy Core (só como referência; nenhum código, banco ou conta é compartilhado).
Plano completo e o mapa do Zappy: `plist/docs/crm-plano.md` nos arquivos do projeto.

## Regra que muda tudo: comprador de marketplace não é contato

Os marketplaces não passam telefone nem e-mail do comprador (o Plist recebe só o apelido no ML e na
Shopee, o primeiro nome na Magalu) e proíbem usar esses dados para marketing. Decidido com o usuário
(24/10/2026): **análise para todos os compradores; WhatsApp, campanhas e cashback só com cliente próprio**
(venda direta, Facebook, cadastro à mão com aceite de ofertas). Para o comprador de marketplace, o contato
é pela conversa do pedido no próprio canal.

## Como o cliente nasce

- `clientes`: um por conta. O de marketplace é criado ao abrir o CRM (`ligarPedidosAClientes`), um por
  canal + apelido (`chave_canal`, em minúsculas), só no ML e na Shopee, onde o apelido é único. Magalu,
  Amazon e Shein ainda não viram cliente (não há identificador confiável).
- `pedidos.cliente_id` liga cada venda ao cliente; o que o CRM calcula (ritmo, segmento, o que compra)
  sai dos pedidos na hora, nada fica guardado para envelhecer.
- `cliente_etiquetas` e `cliente_notas`: interesses e anotações do lojista.

## Telas (abas do CRM)

- **Hoje** (`/crm`, `lib/crm-hoje.ts`): números (clientes que compram, sumindo, funil, conversão em 90 dias), cartões dos
  segmentos e a lista do dia: contatos marcados, oportunidades vencidas ou paradas há 5 dias, aniversários da semana,
  sumindo (os que mais compram primeiro), "chegou" (peça nova à venda na categoria + marca ou tamanho que o cliente
  compra), reconquistar e pós-venda. Botão de WhatsApp com mensagem pronta só para cliente próprio com número.
- **Clientes** (`/crm/clientes`): segmentos por ritmo (`lib/crm-medidas.ts`), busca, planilha (`/crm/clientes.csv`),
  ficha (`/crm/[id]`) e cadastro de cliente próprio (`/crm/novo`). Na ficha do cliente próprio dá para **registrar
  venda direta**: vira pedido `venda_direta`; com peça do estoque, baixa a quantidade e tira dos outros canais
  (`acompanharVenda`).
- **Funil** (`/crm/funil`, `lib/crm-funil.ts`): Contato → Qualificado → Proposta enviada → Negociando → Ganho/Perdido,
  arrastar (computador) ou "Mover" (celular). Perder pede o motivo ("Por que perdemos"); contato sem cadastro vira cliente
  próprio ao ganhar (acha pelo WhatsApp antes de criar). Previsão ponderada pela etapa, conversão, dias até fechar.
- **Campanhas** (`/crm/campanhas`): grupo (segmento, categoria comprada, etiqueta, cidade, top 20%, aniversário) +
  mensagem com {nome} e {empresa}. Só clientes próprios com WhatsApp; oferta só para quem aceitou. Envio um a um pelo
  WhatsApp do lojista (o botão abre o wa.me e marca enviado). Retorno: quem comprou em 7 dias e quanto.

Fora por enquanto: cashback (precisa de caixa no Plist) e perguntas pelo WhatsApp (precisa do WhatsApp Business).
Testes das regras puras: `npm run testar`.
