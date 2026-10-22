# Haul — protótipo

Multicanal para brechós e revendedores no Brasil: um cadastro publica no Mercado Livre, Shopee, Shein, Amazon, Magalu e Facebook Marketplace; vendeu num canal, sai dos outros; etiqueta, tarefas pós-venda, taxas (estimada, real e confirmada) e Command Center.

**Projeto separado do Zappy Core.** Não compartilha código, banco, nuvem, Asaas nem WhatsApp com ele.

## O que tem aqui

- `haul-prototipo.html` — protótipo navegável (só tela, com dados de exemplo). Sem servidor, sem banco; integrações, pagamentos e impressão são simulados.
- Versão publicada: https://claude.ai/artifact/7SU5tHQxUKgTYefe4hrn3A (privada; título "E-Commerce Listing").

## Como abrir

O arquivo é um trecho de página (sem `<html>`/`<head>`), feito para o visualizador de artefatos do Claude. Para abrir no navegador, publique de novo como artefato a partir deste arquivo ou envolva o conteúdo num `<!doctype html><html><body>…</body></html>`. Fora do Claude, a IA nos anúncios e o download de PDF ficam desligados (a página mostra um exemplo no lugar).

## Valores que são exemplo

- Preços dos planos (Essencial R$ 49,90, Profissional R$ 99,90, Avançado R$ 179,90) e o que entra em cada um.
- Tabela de taxas de out/2026 tirada de fontes não oficiais: conferir na central de cada marketplace.
- Prazo de repasse (12 dias), compradores, endereços, rastreios e notas fiscais.

## Próximos passos combinados

Validar com brechós → decisões de negócio (nome/INPI, CNPJ, preços, Facebook Marketplace) → MVP com Mercado Livre e Shopee → aprovações nos marketplaces e parte legal → beta fechado → lançamento.
