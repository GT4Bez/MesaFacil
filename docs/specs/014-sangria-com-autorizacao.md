# 014 — Sangria do caixa com limite e autorização do gerente

> Status: proposta · Regras: RN-13, RN-14, RN-17, **RN-18 (nova)** · Telas: Caixa e Turno

## Contexto

A spec 008 registrou uma limitação conhecida da RN-13. A sangria é recusada (`422`) quando passa do dinheiro esperado na gaveta. A mensagem não mostra o valor, mas a recusa em si já é uma pista.

Um caixa pode tentar sangrias de valores diferentes e desfazer as aceitas com reforços. Por tentativa, descobre o esperado e consegue ajustar a contagem cega (RN-14) para esconder uma sobra ou uma falta.

Para fechar a brecha, a resposta que o caixa recebe **não pode depender do esperado**. Ao mesmo tempo, retiradas grandes precisam de controle. Por isso, como na RN-17, a sangria acima de um limite passa a exigir a autorização do gerente na hora, no mesmo terminal.

## Regras (RN-18)

1. **Limite de sangria do caixa:** `CASH_WITHDRAWAL_APPROVAL_LIMIT` no `.env`, com padrão `200.00`.
   - O valor é público. `GET /shifts/active` passa a trazer `withdrawalApprovalLimit`, para a tela saber quando pedir a autorização.
   - Limite inválido na subida (não numérico ou negativo) impede o backend de iniciar, como as outras variáveis em `env.js`.
2. **Caixa, sangria até o limite:** entra só com valor e motivo (RN-13), **sem comparar com o esperado** (se mandar `approver`, o campo é ignorado e `approved_by` fica `null`).
   - O caixa recebe sempre a mesma resposta, com ou sem dinheiro na gaveta.
   - O esperado pode ficar negativo. Nesse caso, o relatório mostra o valor negativo e a contagem cega mostra a diferença.
3. **Caixa, sangria acima do limite:** exige `approver: { email, password }` de um `manager`/`admin` ativo, conferido por `AuthService.verifyApprover` (RN-17).
   - Campos básicos (`type`, `amount > 0` e `reason`) são validados primeiro (`422`), antes de checar `approver`.
   - Sem `approver` (ausente ou `null`) → barrado antes de `verifyApprover` com `422` "Sangria acima de R$ 200,00 exige a autorização do gerente." (com o limite configurado). Com `approver` presente mas `email`/`password` em branco → `422` pelo próprio `verifyApprover`.
   - Autorização inválida → `403` "Autorização do gerente inválida.", sem encerrar a sessão do caixa.
   - A verificação acontece **antes** de travar o turno. Assim, não segura o lock nem revela `404`/`409` antes da autorização.
4. **Sangria autorizada ou feita pelo gerente:** continua com a checagem da RN-13 (`422` se passar do esperado).
   - A recusa ainda é uma pista, mas só aparece com o gerente presente, que já vê o esperado na tela Turno (RN-13).
5. **Gerente e admin logados** (checados via `hasRole` tanto no backend quanto no formulário compartilhado `CashMovementForm`) fazem sangria como hoje: sem limite, com a checagem do esperado e `expectedCash` na resposta. Se mandarem `approver`, o campo é ignorado.
6. **Reforço** não muda: não tem limite nem autorização, porque não depende do esperado (se mandar `approver`, é ignorado e `approved_by` fica `null`).
7. **Registro:**
   - a sangria autorizada grava `cash_movements.approved_by` (o autorizador);
   - a auditoria `cash.withdrawal` traz `approvedBy: { id, name }` em `details`, com `user_id` = caixa;
   - a lista de movimentos e o relatório mostram "autorizada por <nome>".
8. A conferência cega (RN-14) não muda: sangria depois da contagem continua invalidando a contagem.

## Modelo de dados

`017_add_approved_by_to_cash_movements.sql` (próximo número livre; a `016` é a da spec 015):

```sql
ALTER TABLE cash_movements ADD COLUMN approved_by BIGINT REFERENCES users (id);
-- Só sangria tem autorização.
ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_approval_check
    CHECK (approved_by IS NULL OR type = 'withdrawal');
```

Sem ação nova em `audit_logs`: a ação `cash.withdrawal` ganha `approvedBy` em `details`.

## Contrato da API

`POST /shifts/:id/cash-movements`: o body aceita `approver` (opcional):

```json
{ "type": "withdrawal", "amount": 350, "reason": "Cofre", "approver": { "email": "gerente@mesafacil.com", "password": "..." } }
```

- `201` → movimento com `approvedBy: { id, name }` (ou `null`). Para `manager`/`admin`, a resposta também traz `expectedCash`, como hoje.
- `422`:
  - caixa acima do limite sem `approver`;
  - e-mail ou senha do autorizador em branco;
  - sangria autorizada ou do gerente acima do esperado;
  - e os casos da RN-13.
- `403`: autorização inválida.
- `409`: turno encerrado.

`GET /shifts/active` → `{ ..., "countedAt": null, "withdrawalApprovalLimit": 200 }`.

Movimentos (`GET /shifts/:id/cash-movements` e o bloco `cash.movements` do relatório) ganham `approvedBy` (nome ou `null`).

## Telas

- **Caixa → "Sangria":**
  - quando o valor digitado passa do limite (para o `cashier`), aparece o bloco "Autorização do gerente", com e-mail e senha, e uma linha explicando o motivo;
  - abaixo do limite, o formulário fica como hoje;
  - o erro da API aparece no formulário, e a sessão do caixa não cai com `403`;
  - os campos de senha são limpos depois de cada envio.
- **Lista de movimentos (Caixa e Turno):** sangria autorizada mostra "autorizada por <nome>".
- O gerente logado não vê o bloco de autorização.

## Critérios de aceite

- [ ] Caixa: sangria até o limite entra mesmo acima do esperado (o esperado fica negativo no relatório). A resposta é igual com ou sem saldo e nunca traz `expectedCash`.
- [ ] Caixa acima do limite: sem autorização → `422` com o limite na mensagem; senha errada, autorizador inativo ou sem papel de gerente → `403`, com a mesma mensagem e a sessão mantida; com autorização válida → `201`, com `approved_by` e `approvedBy` na auditoria.
- [ ] Sangria autorizada acima do esperado → `422` (RN-13), e nada é gravado.
- [ ] Gerente e admin: sem limite, com a checagem da RN-13 e `expectedCash` como hoje.
- [ ] Reforço sem mudança; `approved_by` em reforço é barrado pelo banco.
- [ ] `GET /shifts/active` traz `withdrawalApprovalLimit`.
- [ ] Teste da sondagem: o caixa tenta sangrias de 10 em 10 até o limite e recebe sempre `201`, sem `422` que dependa do saldo.
- [ ] Testes de integração (backend), Vitest (bloco de autorização aparece acima do limite) e Cypress (sangria acima do limite com o gerente autorizando no Caixa), atualizando os testes existentes que esperavam recusa `422` do saldo para `cashier` (`cashMovements.test.js`, `cashMovements.test.jsx` e o cenário `9999999` em `app.cy.js`).
- [ ] Docs atualizados:
  - `docs/ESPECIFICACAO.md`: RN-18 na §3.3 e na matriz (§4), além de ajustar a redação da RN-13 sobre sangria do caixa;
  - specs 007 e 008: atualizar a nota da RN-13 (007) e apontar a limitação conhecida (008) para esta spec;
  - `frontend/CONTRATO-API.md`, `.env.example`, `docs/ROTEIRO-DEMO.md` e `scripts/demo-regras.sh`.

## Fora de escopo

- Limite acumulado no turno (soma das sangrias): o caixa pode dividir uma retirada grande em várias pequenas. Cada uma fica auditada e entra na conferência.
- Limite configurável pela tela (fica no `.env`).
- Limite de tentativas de autorização: tratado na [spec 015](015-limite-de-tentativas.md) (RN-19), que vale também para a sangria autorizada.
- Estorno de sangria (o caminho continua sendo um reforço com motivo).
