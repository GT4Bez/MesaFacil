# 007 — Movimentos de caixa: fundo, sangria e reforço

> Status: proposta · Regras: RN-02, **RN-13 (nova)** · Tela mínima: Admin do turno

## Contexto

O turno abre e fecha, mas o sistema não sabe quanto dinheiro deveria estar na gaveta: não registra o troco inicial (fundo), as retiradas para o cofre (sangria) nem os suprimentos de troco (reforço). Sem isso, a conferência cega (spec 008) não tem valor esperado.

## Regras (RN-13)

1. Abrir turno exige `openingFloat` (número ≥ 0, pode ser 0); ausente/inválido → `422`. O fundo vira um movimento `opening_float`.
2. Sangria (`withdrawal`) e reforço (`reinforcement`): `cashier` ou `manager`, turno aberto (`409` se fechado), `amount > 0`, motivo obrigatório (`422`).
3. Dinheiro esperado na gaveta = fundo + Σ (`amount − change_amount`) dos pagamentos em dinheiro do turno − Σ sangrias + Σ reforços.
4. Sangria maior que o dinheiro esperado na gaveta → `422`.
5. Cada movimento (exceto o fundo, que vai em `shift.opened`) gera auditoria (`cash.withdrawal` / `cash.reinforcement`) na mesma transação.
6. Pagamentos pertencem ao turno pelo pedido (`orders.shift_id`).

## Modelo de dados

`012_create_cash_movements.sql`:

```sql
CREATE TABLE cash_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shift_id BIGINT NOT NULL REFERENCES shifts (id),
  user_id BIGINT NOT NULL REFERENCES users (id),
  type VARCHAR(20) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cash_movements_type_check CHECK (type IN ('opening_float', 'withdrawal', 'reinforcement')),
  CONSTRAINT cash_movements_amount_check CHECK (amount > 0 OR (type = 'opening_float' AND amount = 0)),
  CONSTRAINT cash_movements_reason_check CHECK (type = 'opening_float' OR length(trim(COALESCE(reason, ''))) > 0)
);
CREATE UNIQUE INDEX cash_movements_single_float_idx ON cash_movements (shift_id) WHERE type = 'opening_float';

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_action_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check CHECK (action IN (
  'order_item.canceled', 'order.canceled', 'shift.opened', 'shift.closed',
  'menu_item.price_changed', 'cash.withdrawal', 'cash.reinforcement'));
```

Seed: fundo para o turno encerrado do seed atual.

## Contrato da API

- `POST /shifts` — `manager` — body `{ "openingFloat": 150 }`.
- `POST /shifts/:id/cash-movements` — `cashier`, `manager` — body `{ "type": "withdrawal" | "reinforcement", "amount": 200, "reason": "cofre" }` → `{ id, type, amount, expectedCash }` (`201`).
- `GET /shifts/:id/cash-movements` — `cashier`, `manager` — lista de movimentos.

> O dinheiro esperado **não** é exposto ao caixa fora da resposta da sangria, para não esvaziar a conferência cega; `expectedCash` só volta para `manager`.

## Implementação

Estender `ShiftService` (abrir com fundo + auditoria numa transação), com `CashMovementRepository`. Cálculo do esperado em um único método reutilizado pelas specs 008 e 010.

## Telas

**Admin do turno**: abrir turno com campo de fundo; botões "Sangria" e "Reforço" com valor e motivo; lista de movimentos do turno.

## Critérios de aceite

- [ ] Abrir turno sem `openingFloat` → `422`; com 0 → ok (atualizando as chamadas de `POST /shifts` nos testes de integração existentes).
- [ ] Sangria sem motivo → `422`; acima do dinheiro esperado → `422`; em turno fechado → `409`.
- [ ] Garçom e cozinha → `403`.
- [ ] Movimentos geram auditoria com `shift_id`.
- [ ] `docs/ESPECIFICACAO.md`: RN-13 na seção 3.3 "Evoluções da squad" e linha na matriz de validação (§4).

## Fora de escopo

- Despesas pagas pelo caixa, múltiplos caixas/gavetas por turno.
