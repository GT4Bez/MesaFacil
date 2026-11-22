# 008 — Fechamento de turno com conferência cega

> Status: aprovada (revisada antes da implementação) · Regras: RN-02, RN-13, **RN-14 (nova)** · Telas: Caixa e Turno

## Contexto

No fechamento do turno, quem conta a gaveta e os comprovantes deveria fazer isso **sem ver** o valor que o sistema espera. Só assim a diferença (quebra de caixa) é honesta. Hoje `PATCH /shifts/:id/close` só muda o status.

**Decisão da revisão:** a tela Turno (RN-13, spec 007) já mostra ao gerente o dinheiro esperado com o turno aberto. Por isso, a contagem cega fica com o **caixa**, que nunca vê o esperado, e o **encerramento** continua com o gerente, que confere as diferenças.

## Regras (RN-14)

1. **Contagem (caixa):** `PUT /shifts/:id/count` recebe os valores **declarados** de `cash`, `card` e `pix`.
   - Os três são obrigatórios, numéricos e ≥ 0 (senão `422`); a nota é opcional e, se vier, precisa ser texto (`422`).
   - Só `cashier` faz a contagem (`manager` → `403`). O `admin` passa pelo `hasRole`, como em todo o sistema (RN-16); como ele também vê o relatório, a contagem feita por ele não é cega. Fica registrada com o nome dele em `countedBy` e na auditoria.
2. A contagem só acontece com o turno aberto (`409` se encerrado, `404` se não existe) e **sem pedidos ativos** (`409` "Feche as comandas abertas antes da contagem.").
3. O backend calcula e **congela** o esperado de cada forma no momento da contagem:
   - dinheiro: o mesmo cálculo da RN-13 (`CashMovementRepository.findCashSummary`: fundo + dinheiro líquido de troco − sangrias + reforços);
   - cartão e Pix: Σ (`amount − change_amount`) dos pagamentos do turno naquela forma.

   `difference = declared − expected` é uma coluna gerada.
4. **O esperado nunca volta para o caixa:** nem na resposta da contagem, nem em `GET /shifts/active` (que só informa `countedAt`), nem nas mensagens de erro. A sangria já usa uma mensagem genérica desde a spec 007.
5. **Recontagem:** o caixa pode contar de novo enquanto o turno estiver aberto, e a contagem nova substitui a anterior. Cada contagem grava `shift.counted` em `audit_logs`, só com os declarados e a nota.
6. **Encerramento (gerente):** `PATCH /shifts/:id/close` exige, nesta ordem:
   - RN-02: nenhum pedido ativo (`409`);
   - contagem feita (`409` "O caixa ainda não fez a contagem de fechamento.");
   - contagem válida: se o esperado mudou desde a contagem (pagamento, sangria ou reforço depois dela), `409` pedindo uma nova contagem;
   - se alguma diferença ≠ 0, **motivo** obrigatório (`422`).
7. O turno fecha mesmo com diferença. Numa única transação, com o turno travado (`FOR UPDATE`), grava `closed_by`, `closing_note` (o motivo) e `shift.closed` em `audit_logs`, com as diferenças e o motivo em `details`.
8. **Relatório (RN-10):** `GET /shifts/:id/report` (só gerente) ganha o bloco `closing`, com contagem, diferenças e motivo.
   - Com o turno aberto, o bloco mostra também `stale`, que indica se a contagem ficou desatualizada.
   - Sem contagem, `closing` é `null`.

## Modelo de dados

`014_create_shift_counts.sql` (a `013` é dos movimentos de caixa):

```sql
CREATE TABLE shift_counts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shift_id BIGINT NOT NULL REFERENCES shifts (id),
  payment_method VARCHAR(10) NOT NULL,          -- cash | card | pix
  declared DECIMAL(10, 2) NOT NULL,             -- CHECK (declared >= 0)
  expected DECIMAL(10, 2) NOT NULL,             -- congelado na contagem
  difference DECIMAL(11, 2) GENERATED ALWAYS AS (declared - expected) STORED,
  counted_by BIGINT NOT NULL REFERENCES users (id),
  counted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT,
  CONSTRAINT shift_counts_unique UNIQUE (shift_id, payment_method)
);

ALTER TABLE shifts ADD COLUMN closed_by BIGINT REFERENCES users (id), ADD COLUMN closing_note TEXT;
-- audit_logs_action_check ganha 'shift.counted', mantendo as ações das specs 005, 007 e 011.
```

## Contrato da API

`PUT /shifts/:id/count` — `cashier`:

```json
{ "declared": { "cash": 412.5, "card": 980, "pix": 310 }, "note": "gaveta conferida" }
```

Resposta: `{ shiftId, countedAt, declared, note }`, **sem o esperado**.

`PATCH /shifts/:id/close` — `manager`, body opcional `{ "reason": "faltou troco de 2,50" }`. Resposta:

```json
{ "id": "3", "status": "closed", "openedAt": "...", "closedAt": "...",
  "closing": { "countedBy": "Caixa", "countedAt": "...", "note": null, "reason": "faltou troco de 2,50",
               "methods": [{ "method": "cash", "declared": 412.5, "expected": 415, "difference": -2.5 }, ...] } }
```

O relatório retorna `closing` no mesmo formato, mais o campo `stale`; `shift.closedBy` traz o nome de quem encerrou. Por fim, `GET /shifts/active` passa a incluir `countedAt` (ou `null`).

## Telas

- **Caixa → "Contagem de fechamento":** três campos (dinheiro, cartão, Pix) e uma nota, sem nenhum total esperado na tela. Depois do envio, mostra o horário da contagem e permite recontar.
- **Turno (gerente) → "Conferência":**
  - mostra declarado × esperado × diferença por forma, com as diferenças destacadas;
  - o motivo é obrigatório quando houver diferença;
  - "Encerrar turno" fica desabilitado, com explicação, sem contagem ou com contagem desatualizada.
- **Salão:** o "Encerrar turno" do banner leva à tela Turno.

## Critérios de aceite

- [ ] Contar sem os três declarados ou com valor negativo → `422`; garçom, cozinha e gerente → `403`.
- [ ] A resposta da contagem e `GET /shifts/active` não trazem o esperado.
- [ ] Encerrar sem contagem → `409`; com pedido ativo → `409`, e a contagem não é gravada.
- [ ] Diferença ≠ 0 sem motivo → `422`; com motivo, o turno fecha e grava `closed_by`, `closing_note` e `shift.closed` com as diferenças.
- [ ] O esperado em dinheiro considera fundo, troco, sangrias e reforços (teste com todos).
- [ ] Movimento depois da contagem → `409` até recontar; o relatório mostra `stale: true`.
- [ ] Testes de integração existentes atualizados (todo encerramento passa pela contagem).
- [ ] `docs/ESPECIFICACAO.md`: RN-14 na seção 3.3 e na matriz (§4); `frontend/CONTRATO-API.md`, `docs/ROTEIRO-DEMO.md` e `scripts/demo-regras.sh` atualizados.

## Fora de escopo

- Contagem por cédula, reabertura de turno, segundo conferente.
- Tolerância de diferença (qualquer centavo exige motivo).
- **Limitação conhecida (anterior a esta spec):** a sangria recusa valores acima do dinheiro esperado (RN-13). Um caixa que tente várias sangrias e desfaça as aceitas com reforços consegue descobrir o esperado por tentativa. Mitigação possível numa spec futura: sangria acima de um limite exigir a autorização do gerente (como na RN-17), ou auditar as sangrias recusadas.
