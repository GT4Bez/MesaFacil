# 005 — Auditoria e cancelamento de pedido com motivo

> Status: proposta · Regras: RN-03, RN-05, **RN-14 (nova)**

## Contexto

Cancelar item enviado já exige gerente e motivo (RN-05), mas cancelar o **pedido inteiro** não pede motivo nem registra quem cancelou. Operações sensíveis (cancelamentos, sangrias, fechamento de turno, mudança de preço, ajuste de estoque) não deixam rastro consultável.

## Regras (RN-14)

1. Cancelar pedido: apenas `manager`, com motivo obrigatório (sem motivo → `422`, outro papel → `403`).
2. Pedido com pagamento registrado não pode ser cancelado → `409` (estorno fora de escopo).
3. Ao cancelar o pedido, todos os itens ainda não cancelados passam a `canceled` com o mesmo `canceled_by` e motivo, na mesma transação, e a mesa volta a `available`.
4. Toda ação sensível grava uma linha em `audit_logs` **na mesma transação** da ação. Lista fechada de ações:

| `action` | Origem |
| :-- | :-- |
| `order_item.canceled` | cancelamento de item enviado (RN-05) |
| `order.canceled` | este documento |
| `shift.opened` / `shift.closed` | turnos (spec 007/008) |
| `cash.withdrawal` / `cash.reinforcement` | spec 007 |
| `menu_item.price_changed` | spec 002 |
| `stock.adjusted` | spec 009 |

5. Não há tela de auditoria: os registros aparecem no relatório do turno (spec 010).

## Modelo de dados

`009_add_cancellation_to_orders.sql`:

```sql
ALTER TABLE orders
  ADD COLUMN canceled_by BIGINT REFERENCES users (id),
  ADD COLUMN cancellation_reason TEXT,
  ADD CONSTRAINT orders_cancellation_reason_check
    CHECK (canceled_by IS NULL OR length(trim(COALESCE(cancellation_reason, ''))) > 0);
```

`010_create_audit_logs.sql`:

```sql
CREATE TABLE audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id),
  shift_id BIGINT REFERENCES shifts (id),
  action VARCHAR(40) NOT NULL,
  entity VARCHAR(30) NOT NULL,
  entity_id BIGINT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT audit_logs_action_check CHECK (action IN (
    'order_item.canceled', 'order.canceled', 'shift.opened', 'shift.closed',
    'cash.withdrawal', 'cash.reinforcement', 'menu_item.price_changed', 'stock.adjusted'))
);
CREATE INDEX audit_logs_shift_idx ON audit_logs (shift_id);
```

`details` guarda o contexto (ex.: `{ "reason": "…", "from": 42.5, "to": 45 }`).

## Contrato da API

- `PATCH /orders/:id/status` com `{ "status": "canceled", "reason": "cliente desistiu" }` — `manager`.
- `GET /orders/:id` passa a trazer `cancellation: { reason, canceledBy: { id, name } } | null`.

## Implementação

`backend/src/services/AuditLogService.js` com `record({ userId, shiftId, action, entity, entityId, details }, db)` — sempre recebe o `db` da transação corrente; `OrderService.updateItemStatus` (RN-05) e `updateStatus('canceled')` passam a chamá-lo.

## Telas

Botão "Cancelar pedido" (só gerente) na comanda abre modal com motivo obrigatório.

## Critérios de aceite

- [ ] Cancelar pedido sem motivo → `422`; garçom → `403`; com pagamento → `409`.
- [ ] Itens ativos do pedido cancelado ficam `canceled` com o mesmo motivo.
- [ ] Cancelar item enviado e cancelar pedido geram `audit_logs` com `shift_id`.
- [ ] Se a gravação da auditoria falhar, o cancelamento sofre rollback (teste).
- [ ] README §6: RN-14 na seção "Evoluções da squad".

## Fora de escopo

- Tela de consulta de auditoria, estorno de pagamento.
