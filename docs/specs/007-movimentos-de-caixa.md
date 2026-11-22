# 007 — Movimentos de caixa: fundo, sangria e reforço

> Status: aprovada (revisada antes da implementação) · Regras: RN-02, RN-10, **RN-13 (nova)** · Tela mínima: Admin do turno

## Contexto

O turno abre e fecha, mas o sistema não sabe quanto dinheiro deveria estar na gaveta: não registra o troco inicial (fundo), as retiradas para o cofre (sangria) nem os suprimentos de troco (reforço). Sem isso, a conferência cega (spec 008) não tem valor esperado.

## Regras (RN-13)

1. Abrir turno exige `openingFloat` (número ≥ 0, pode ser 0); ausente/inválido → `422`. O fundo vira um movimento `opening_float`.
2. Sangria (`withdrawal`) e reforço (`reinforcement`): `cashier` ou `manager` (e `admin`, RN-16), turno aberto (`409` se fechado), `amount > 0` (arredondado a 2 casas, como nos pagamentos), motivo obrigatório (`422`).
3. Dinheiro esperado na gaveta = fundo + Σ (`amount − change_amount`) dos pagamentos em dinheiro de pedidos não cancelados do turno − Σ sangrias + Σ reforços. Turno sem fundo registrado (anterior a esta spec) conta fundo 0.
4. Sangria maior que o dinheiro esperado na gaveta → `422`, com mensagem que **não** revela o valor esperado. O movimento trava o turno (`FOR UPDATE`) para que duas sangrias simultâneas não passem do saldo nem entrem depois do fechamento.
5. Cada movimento (exceto o fundo, que vai em `shift.opened`) gera auditoria (`cash.withdrawal` / `cash.reinforcement`) na mesma transação.
6. Pagamentos pertencem ao turno pelo pedido (`orders.shift_id`).
7. O dinheiro esperado só é exposto a `manager`/`admin` (RN-10), para não esvaziar a conferência cega da spec 008.

## Modelo de dados

`013_create_cash_movements.sql` (próximo número livre):

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

-- Mantém as ações já existentes (inclusive as de usuários da spec 011) e acrescenta as do caixa.
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_action_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check CHECK (action IN (
  'order_item.canceled', 'order.canceled', 'shift.opened', 'shift.closed',
  'menu_item.price_changed',
  'user.created', 'user.updated', 'user.password_reset', 'user.password_changed',
  'cash.withdrawal', 'cash.reinforcement'));
```

Seed (`009_seed_cash_movements.sql`): fundo para o turno encerrado do seed atual.

## Contrato da API

- `POST /shifts` — `manager` — body `{ "openingFloat": 150 }` → turno aberto (`201`), com o fundo registrado e auditado em `shift.opened` (`details.openingFloat`).
- `POST /shifts/:id/cash-movements` — `cashier`, `manager` — body `{ "type": "withdrawal" | "reinforcement", "amount": 200, "reason": "cofre" }` → `201`:
  - para `cashier`: `{ id, type, amount, reason, createdAt }`;
  - para `manager`/`admin`: o mesmo, mais `expectedCash` (dinheiro esperado depois do movimento).
- `GET /shifts/:id/cash-movements` — `cashier`, `manager` — `[{ id, type, amount, reason, by, createdAt }]`, em ordem de registro (o fundo primeiro). Não traz o esperado.
- `GET /shifts/:id/report` (spec 010, só `manager`) ganha o bloco `cash`:

```json
"cash": {
  "openingFloat": 150,
  "cashPayments": 412.5,
  "withdrawals": 200,
  "reinforcements": 50,
  "expected": 412.5,
  "movements": [{ "id": "1", "type": "opening_float", "amount": 150, "reason": null, "by": "Gerente", "createdAt": "…" }]
}
```

> O dinheiro esperado **nunca** volta para o caixa: nem na resposta do movimento, nem na mensagem do `422` da sangria acima do saldo. Ele só aparece para `manager`/`admin` (resposta do movimento e relatório).

## Implementação

Estender `ShiftService` (abrir com fundo + auditoria numa transação), com `CashMovementRepository`. Cálculo do esperado em um único método do repositório, reutilizado pela validação da sangria, pelo relatório (010) e pela conferência cega (008).

## Telas

**Admin do turno** (gerente): abrir turno com campo de fundo; botões "Sangria" e "Reforço" com valor e motivo; lista de movimentos do turno; bloco "Caixa" no relatório (fundo, pagamentos em dinheiro, sangrias, reforços e esperado).

**Caixa**: botões "Sangria" e "Reforço" com valor e motivo, e a lista de movimentos do turno aberto, **sem** o dinheiro esperado.

## Critérios de aceite

- [ ] Abrir turno sem `openingFloat` → `422`; com 0 → ok (atualizando as chamadas de `POST /shifts` nos testes de integração existentes).
- [ ] Sangria sem motivo → `422`; acima do dinheiro esperado → `422`; em turno fechado → `409`.
- [ ] Garçom e cozinha → `403`.
- [ ] Caixa não recebe `expectedCash` (nem no `422`); gerente recebe.
- [ ] Movimentos geram auditoria com `shift_id`; o fundo vai em `shift.opened`.
- [ ] Duas sangrias simultâneas que juntas passam do esperado: só uma entra.
- [ ] Relatório traz o bloco `cash`, e `expected` bate com fundo + dinheiro líquido − sangrias + reforços (com troco no meio).
- [ ] Chamadas a `POST /shifts` atualizadas também no Cypress, em `scripts/demo-regras.sh` e em `docs/ROTEIRO-DEMO.md`.
- [ ] `docs/ESPECIFICACAO.md`: RN-13 na seção 3.3 "Evoluções da squad" e linha na matriz de validação (§4).

## Fora de escopo

- Despesas pagas pelo caixa, múltiplos caixas/gavetas por turno.
