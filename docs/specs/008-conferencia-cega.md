# 008 — Fechamento de turno com conferência cega

> Status: proposta · Regras: RN-02, **RN-13 (nova)**

## Contexto

Ao fechar o turno, quem fecha deveria contar o que tem na gaveta e nos comprovantes **sem ver** o valor que o sistema espera — só assim a diferença (quebra de caixa) é honesta. Hoje `PATCH /shifts/:id/close` só muda o status.

## Regras (RN-13)

1. O fechamento recebe os valores **declarados** de `cash`, `card` e `pix` (números ≥ 0, todos obrigatórios → `422`).
2. O backend calcula o **esperado** de cada forma: dinheiro conforme RN-12 (spec 007); cartão e Pix = Σ `amount` dos pagamentos do turno naquela forma.
3. `difference = declared − expected` por forma. Se alguma diferença ≠ 0, `reason` é obrigatório (`422`).
4. O turno fecha mesmo com diferença; o resultado fica gravado e vai para auditoria (`shift.closed` com as diferenças em `details`).
5. RN-02 continua: com pedido ativo → `409`, e nada é gravado.
6. Tudo numa transação: grava `shift_closings`, fecha o turno, grava auditoria.
7. O valor esperado só é revelado **na resposta do fechamento** — nenhuma rota o mostra ao caixa antes.

## Modelo de dados

`013_create_shift_closings.sql`:

```sql
ALTER TABLE shifts
  ADD COLUMN closed_by BIGINT REFERENCES users (id),
  ADD COLUMN closing_note TEXT;

CREATE TABLE shift_closings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shift_id BIGINT NOT NULL REFERENCES shifts (id),
  payment_method VARCHAR(10) NOT NULL,
  declared DECIMAL(10, 2) NOT NULL CHECK (declared >= 0),
  expected DECIMAL(10, 2) NOT NULL,
  difference DECIMAL(10, 2) GENERATED ALWAYS AS (declared - expected) STORED,
  CONSTRAINT shift_closings_method_check CHECK (payment_method IN ('cash', 'card', 'pix')),
  CONSTRAINT shift_closings_unique UNIQUE (shift_id, payment_method)
);
```

## Contrato da API

`PATCH /shifts/:id/close` — `manager` — body:

```json
{ "declared": { "cash": 412.5, "card": 980, "pix": 310 }, "reason": "faltou troco de 2,50" }
```

Resposta: `{ id, status: "closed", closings: [{ method, declared, expected, difference }] }`.

## Telas

Admin do turno → "Fechar turno": três campos de valor declarado, sem nenhum total esperado na tela; campo de motivo; depois de confirmar, mostra o resultado com as diferenças destacadas.

## Critérios de aceite

- [ ] Fechar sem os três declarados → `422`.
- [ ] Diferença ≠ 0 sem motivo → `422`; com motivo → fecha e grava.
- [ ] Esperado em dinheiro considera fundo, troco, sangrias e reforços (teste com todos).
- [ ] Pedido ativo → `409` e nenhuma linha em `shift_closings`.
- [ ] README §6: RN-13.

## Fora de escopo

- Contagem por cédula, reabertura de turno, segundo conferente.
