# 010 — Relatório do turno (v1)

> Status: proposta · Regras: **RN-10** · Tela mínima: Admin do turno · Fase: MVP

## Contexto

RN-10 exige que o faturamento do turno seja derivado do banco, nunca calculado no React (issue #27). Esta v1 usa apenas as tabelas que já existem (`shifts`, `orders`, `order_items`, `payments`, `users`), sem depender das specs da Fase 2.

## Regras

1. Apenas `manager` (`403` para os demais); turno inexistente → `404`.
2. Disponível com o turno aberto (parcial, `shift.status = "open"`) e fechado.
3. Todos os valores são calculados por SQL no backend; o frontend só exibe.
4. `totalShift` = Σ `payments.amount` dos pedidos não cancelados do turno (`orders.shift_id`); em turno aberto, pagamentos já lançados compõem o total parcial, enquanto `ordersClosed` e `byMenuItem` consideram apenas pedidos `closed`.
5. `ordersClosed` = pedidos `closed` do turno; `averageTicket` = `totalShift / ordersClosed` (0 sem pedidos fechados), arredondado em 2 casas.
6. Vendas por item consideram apenas itens não cancelados de pedidos `closed`, pelo `unit_price` congelado (RN-09).
7. Pedidos cancelados não entram em faturamento, ticket médio nem vendas por item; aparecem só no bloco de cancelamentos. `cancellations.items` filtra `canceled_by IS NOT NULL` (cancelamentos gerenciais da RN-05, ignorando itens `pending` removidos pelo garçom).

## Modelo de dados

Sem migration nova.

## Contrato da API

`GET /shifts/:id/report` — `manager`:

```json
{
  "shift": { "id": "3", "status": "closed", "openedAt": "…", "closedAt": "…", "openedBy": "Gerente" },
  "totalShift": 1702.5,
  "ordersClosed": 21,
  "averageTicket": 81.07,
  "byPaymentMethod": [{ "method": "cash", "total": 412.5, "count": 7 }],
  "byMenuItem": [{ "menuItemId": "1", "name": "Picanha na Chapa", "quantity": 12, "total": 1078.8 }],
  "cancellations": {
    "ordersCount": 1,
    "orders": [],
    "items": [{ "orderItemId": "40", "name": "Suco Natural", "quantity": 1, "reason": "Sem estoque", "by": "Gerente" }]
  }
}
```

- `byPaymentMethod` traz sempre `cash`, `card` e `pix` (com 0 quando não houver).
- `byMenuItem` ordenado por `total` decrescente.
- `cancellations.ordersCount` mantém o total numérico e `cancellations.orders` já nasce como array (`[]` na v1), passando a trazer `{ orderId, reason, by }` quando a spec 005 for implementada sem quebrar tipo do contrato.

## Telas

**Admin do turno** (gerente): abrir e encerrar turno (rotas atuais) e aba "Relatório" com cartões (total, pedidos, ticket médio), tabela por forma de pagamento, ranking de itens e cancelamentos.

## Critérios de aceite

- [ ] `totalShift` bate com `SELECT sum(amount)` dos pagamentos do turno (teste de integração com pagamentos parciais e pedido cancelado).
- [ ] Turno aberto devolve relatório parcial.
- [ ] Pedido cancelado não altera faturamento nem ticket médio.
- [ ] Garçom → `403`; turno inexistente → `404`.
- [ ] `docs/ESPECIFICACAO.md` (matriz §4) e tabela de rotas do README atualizadas; fecha #27 e a parte de turno do #16.

## Fora de escopo (Fase 2)

- Troco, fundo, sangria e reforço, resultado da conferência cega e CMV: entram como blocos adicionais do relatório nas specs da Fase 2 (006–009).
- Exportar PDF/CSV, comparação entre turnos, gráficos por hora.
