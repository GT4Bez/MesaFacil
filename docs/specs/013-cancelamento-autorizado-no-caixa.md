# 013 — Cancelamento de item no caixa com autorização do gerente

> Status: proposta · Regras: RN-05, RN-11, RN-12, **RN-17 (nova)** · Tela: Caixa

## Contexto

Na hora de fechar a conta, o cliente aponta um item que não quer pagar (veio errado, não chegou, foi lançado em dobro). Hoje, pela RN-05, só o **gerente logado** cancela item já enviado à cozinha. Em operação, isso obriga o caixa a sair do posto, chamar o gerente e trocar de usuário no mesmo terminal.

O padrão comum em caixa é a **autorização na hora**: o caixa pede o cancelamento, e o gerente digita as próprias credenciais no mesmo modal, sem trocar de sessão. O sistema registra quem pediu e quem autorizou.

Também há uma lacuna na regra atual: o cancelamento gerencial (RN-05) não confere pagamentos e pode deixar o valor pago **maior** que o novo total da conta, sem estorno possível.

## Regras (RN-17)

1. O `cashier` pode cancelar um item de pedido ativo (`open`, `in_kitchen` ou `ready_to_pay`) informando **motivo** (obrigatório, `422`) e a **autorização** de um usuário ativo com papel `manager` ou `admin` (e-mail e senha dele).
2. Autorização inválida (credenciais erradas, usuário inativo ou sem papel de gerente) → `403` com uma única mensagem genérica, "Autorização do gerente inválida.", sem dizer qual parte falhou.
   - Não é `401`: o `401` encerraria a sessão do **caixa** no frontend.
3. O autorizador não pode ser o próprio caixa: o papel já impede, e `manager` ou `admin` logados no Caixa cancelam direto pela RN-05 (`PATCH /order-items/:id/status`, sem passar por `authorized-cancel`, onde `manager` receberia `403`).
4. Item já cancelado → `409`; pedido encerrado ou cancelado → `409`.
5. **Pagamentos (vale também para a RN-05 e para itens `pending`):** como o Caixa já aceita pagamento com o pedido `open` ou `in_kitchen`, se o pedido já tem pagamentos e, sem o item (seja `pending` ou enviado), o valor efetivamente pago (`amount − change_amount`) passaria do novo total (com a taxa de serviço persistida, RN-12), o cancelamento é recusado com `409`: "O valor já pago passaria do novo total da conta. Estorno não é suportado." É a mesma lógica de desligar a taxa já paga.
6. A normalização do e-mail (`trim().toLowerCase()`) e a verificação das credenciais do aprovador ocorrem **antes** de adquirir o `FOR UPDATE` no pedido (para não segurar lock de linha nem vazar `404`/`409` antes da autorização); em seguida, tudo roda numa transação com o pedido travado (`FOR UPDATE`, como nos pagamentos).
   - O item fica com `canceled_by` = **autorizador** e `cancellation_reason` = motivo.
   - A auditoria grava `order_item.canceled`, com `user_id` = caixa e `details` = `{ orderId, reason, previousStatus, approvedBy: { id, name } }`.
7. Item cancelado sai do KDS e da conta, como hoje.
8. Tentativas com autorização inválida não alteram nada. O limite de tentativas fica fora de escopo.

## Modelo de dados

Sem migration. Reaproveita `order_items.canceled_by` / `cancellation_reason` e a ação `order_item.canceled` de `audit_logs`, com `approvedBy` em `details`.

## Contrato da API

`POST /order-items/:id/authorized-cancel` — papel `cashier` (o `admin` passa pela regra central `hasRole`):

```json
{ "reason": "Cliente não recebeu o prato", "approver": { "email": "gerente@mesafacil.com", "password": "..." } }
```

- `200` → `{ "id": "21", "status": "canceled", "approvedBy": { "id": "4", "name": "Gerente" } }`;
- `422` sem motivo ou sem autorização;
- `403` papel errado ou autorização inválida;
- `404` item inexistente;
- `409` item já cancelado, pedido inativo ou valor pago acima do novo total.

`PATCH /order-items/:id/status` (RN-05 / cancelamento de `pending` ou enviado) passa a recusar com o mesmo `409` da regra 5 sempre que o pedido já possuir pagamentos incompatíveis com o novo total.

## Telas

**Caixa**, no extrato da conta:
- cada item ativo ganha um botão "×" (44 px);
- quando o operador logado for `manager` ou `admin` (`hasRole(user, 'manager')`), o botão abre apenas o modal de motivo e chama `PATCH /order-items/:id/status` (RN-05), sem pedir e-mail/senha;
- quando o operador for `cashier`, abre o `Modal` (spec 012) "Cancelar item com autorização", mostrando item/valor e pedindo motivo + **autorização do gerente** (e-mail e senha);
- o botão "Cancelar item" fica desabilitado durante o envio;
- o erro da API aparece no modal;
- com sucesso, a conta recarrega e o aviso confirma: "Picanha cancelada (autorizado por Gerente)" (ou "Picanha cancelada" no fluxo RN-05).

## Critérios de aceite

- [ ] Caixa cancela com autorização válida de gerente ou admin; o item some da conta e do KDS; o total e o saldo são recalculados.
- [ ] `manager` e `admin` operando `/cashier` cancelam direto pelo `"×"` via RN-05 (sem modal de credenciais).
- [ ] Sem motivo → `422`; credenciais erradas, usuário inativo ou autorizador garçom/caixa/cozinha → `403` com a mesma mensagem; garçom e cozinha chamando a rota → `403`.
- [ ] Item já cancelado ou pedido encerrado → `409`.
- [ ] Pedido com pagamento: cancelar qualquer item (`pending` ou enviado) que faria o pago passar do total → `409` (nesta rota e em `PATCH /order-items/:id/status`); quando ainda cabe, o cancelamento passa.
- [ ] Auditoria com `user_id` do caixa e `details.approvedBy`; `canceled_by` = autorizador; o relatório do turno lista o cancelamento com o nome do gerente.
- [ ] A sessão do caixa não cai com autorização inválida (o `403` não aciona o logout).
- [ ] Testes de integração (backend), Vitest (modal) e Cypress (cancelar no caixa com o gerente autorizando).
- [ ] `docs/ESPECIFICACAO.md` (RN-17 na §3.3 e na matriz §4), `frontend/CONTRATO-API.md` e o roteiro de demonstração atualizados.

## Fora de escopo

- Estorno de pagamento.
- PIN numérico ou cartão do gerente (usa e-mail e senha).
- Pedido de aprovação assíncrono (o gerente aprova depois, na tela dele).
- Limite de tentativas de autorização (rate limiting).
