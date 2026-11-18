# 010 — Relatório do turno

> Status: proposta · Regras: **RN-10**, RN-11 a RN-15 · Tela mínima: Admin do turno

## Contexto

RN-10 exige que o faturamento do turno seja derivado do banco, nunca calculado no React. Com troco, movimentos de caixa, conferência cega, auditoria e ficha técnica, o relatório passa a ser o painel de fechamento do gerente.

## Regras

1. Apenas `manager` (`403` para os demais).
2. Disponível com o turno aberto (parcial, `status: "open"`, sem bloco `closing`) e fechado (completo).
3. Todos os valores são calculados por SQL no backend.
4. `totalShift` = Σ (`amount − change_amount`) dos pagamentos dos pedidos do turno (RN-10).
5. Pedidos cancelados não entram em faturamento, ticket médio nem vendas por produto.

## Contrato da API

`GET /shifts/:id/report`:

```json
{
  "shift": { "id": "3", "status": "closed", "openedAt": "…", "closedAt": "…", "openedBy": "Mariana Gerente", "closedBy": "Mariana Gerente" },
  "totalShift": 1702.5,
  "serviceTaxTotal": 140.0,
  "ordersClosed": 21,
  "averageTicket": 81.07,
  "byPaymentMethod": [{ "method": "cash", "total": 412.5, "count": 7 }],
  "byMenuItem": [{ "menuItemId": "1", "name": "Picanha na Chapa", "quantity": 12, "total": 1078.8 }],
  "cancellations": {
    "orders": [{ "orderId": "9", "reason": "…", "by": "…", "at": "…" }],
    "items": [{ "orderItemId": "40", "name": "…", "quantity": 1, "reason": "…", "by": "…", "at": "…" }]
  },
  "cashMovements": [{ "type": "withdrawal", "amount": 200, "reason": "cofre", "by": "…", "at": "…" }],
  "closing": [{ "method": "cash", "declared": 410, "expected": 412.5, "difference": -2.5 }],
  "cmv": { "cost": 512.3, "percentOfSales": 30.1, "coverage": { "withRecipe": 6, "total": 8 } },
  "audit": [{ "action": "order.canceled", "by": "…", "at": "…", "details": {} }]
}
```

`averageTicket` = `totalShift / ordersClosed` (0 sem pedidos). `cmv.cost` = Σ `−quantity × unit_cost` dos movimentos `sale` do turno.

## Telas

**Admin do turno**, aba "Relatório": cartões (total, ticket médio, CMV %), tabela por forma de pagamento, ranking de produtos, cancelamentos, movimentos de caixa e resultado da conferência com diferenças destacadas. Atualiza ao reabrir a aba (sem polling).

## Critérios de aceite

- [ ] `totalShift` bate com a soma feita direto no banco num cenário com troco e taxa de serviço (teste de integração).
- [ ] Turno aberto devolve relatório parcial sem `closing`.
- [ ] Pedido cancelado não altera faturamento nem ticket médio.
- [ ] CMV usa o custo gravado nos movimentos (snapshot), não o custo atual.
- [ ] Fecha as issues de relatório do turno (RN-10) e Admin do turno.

## Fora de escopo

- Exportar PDF/CSV, comparação entre turnos, gráficos por hora.
