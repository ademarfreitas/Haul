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

## Próximos PRs

2. Clientes e ficha (segmentos por ritmo, o que compra, notas, etiquetas, próximo passo, cadastro de
   cliente próprio, CSV). 3. Hoje. 4. Funil de oportunidades. 5. Campanhas (só cliente próprio com aceite).
