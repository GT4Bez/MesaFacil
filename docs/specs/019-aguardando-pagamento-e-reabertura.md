# 019 — Mesa "Aguardando pagamento" e reabertura da conta

> Status: proposta · Regras: RN-03 (extensão), RN-20 (nova categoria) · Telas: Salão, Comanda, Caixa e Auditoria

## Contexto

Quando o garçom clica em "Pedir a conta", o pedido vai para `ready_to_pay`. Hoje isso só aparece dentro da comanda:
- no **Salão**, a mesa continua "Ocupada", igual a uma mesa em pleno atendimento;
- no **Caixa**, a lista "Selecionar comanda" não diz quais mesas já pediram a conta;
- **não há volta:** se o cliente desiste de ir embora ou falta lançar um item, a comanda fica travada, porque adicionar item exige `open` ou `in_kitchen` e a máquina de estados (RN-03) não volta de `ready_to_pay`.

Esta spec mostra o estado "Aguardando pagamento" no Salão e no Caixa e cria a **reabertura da conta**, auditada.

## Regras

1. **`GET /tables` traz o status do pedido ativo:** cada mesa ganha `orderStatus` (`open`, `in_kitchen`, `ready_to_pay` ou `null` quando livre).
   - O `status` da mesa continua `available | occupied`; quem já usa o contrato não quebra.
   - A tela mostra a tag **"Aguardando pagamento"** quando `orderStatus === 'ready_to_pay'`.
2. **Reabrir a conta:** `POST /orders/:id/reopen`, com corpo `{ "reason": "Cliente pediu sobremesa" }`. O motivo é opcional, com até 200 caracteres; texto vazio vira `null`.
   - **Papéis:** garçom, caixa e gerente (o admin passa pelo `hasRole`). Cozinha recebe `403`.
   - **Transição:** só a partir de `ready_to_pay`, voltando para `in_kitchen`, o estado "em atendimento" da RN-03. Os itens já estão prontos ou cancelados, então o garçom pode lançar itens novos e pedir a conta de novo pelo fluxo normal (RN-06).
   - De qualquer outro status → `409`. Pedido inexistente → `404`. Motivo acima de 200 caracteres ou que não seja texto → `422`.
   - **Pagamentos** já registrados permanecem; o saldo devedor só cresce com os itens novos. A taxa de serviço não muda.
3. **Auditoria:** a reabertura grava `order.reopened` na mesma transação, com `entity: 'order'` e `details: { reason, paidAmount }`. `reason` é `null` sem motivo, e `paidAmount` é o total já pago naquele momento.
   - **RN-20:** nova categoria `orders` ("Pedidos") na tela de auditoria, com `order.reopened`. O gerente vê a categoria.
4. **RN-03 atualizada:** fluxo `open → in_kitchen → ready_to_pay → closed`, com a volta `ready_to_pay → in_kitchen` apenas pela reabertura.

## Modelo de dados

Migration `019_add_order_reopened_audit_action.sql`: recria o `audit_logs_action_check` com a lista atual mais `order.reopened`. Sem colunas novas.

## Contrato da API

`GET /tables`

```json
[
  { "id": "1", "number": 1, "status": "available", "activeOrderId": null, "orderStatus": null },
  { "id": "2", "number": 2, "status": "occupied", "activeOrderId": "42", "orderStatus": "ready_to_pay" }
]
```

`POST /orders/42/reopen` com `{ "reason": "Faltou lançar a sobremesa" }` → `200 { "id": "42", "status": "in_kitchen" }`

Registro de auditoria (via `GET /audit-logs?category=orders`):

```json
{ "action": "order.reopened", "entity": "order", "entityId": "42",
  "details": { "reason": "Faltou lançar a sobremesa", "paidAmount": 50 },
  "target": { "orderId": "42", "tableNumber": 2 } }
```

## Telas

- **Salão:**
  - mesa com conta pedida em tom de aviso, com a tag "Aguardando pagamento" no lugar de "Ocupada" e o texto "Conta pedida · ver comanda →";
  - a legenda ganha "Aguardando pagamento";
  - o card "Mesas ocupadas" diz quantas aguardam pagamento.
- **Caixa:**
  - na lista "Selecionar comanda", as mesas aguardando pagamento aparecem primeiro, com a tag;
  - no extrato de uma conta pedida, o botão **"Reabrir conta"** abre um modal com motivo opcional. Depois da reabertura, a conta e a lista são recarregadas e um aviso confirma.
- **Comanda:**
  - com a conta pedida, o botão "Pedir a conta" dá lugar a **"Reabrir conta"**, com o mesmo modal;
  - a dica passa a dizer "Conta pedida: o pagamento é feito no caixa. Reabra a conta para lançar mais itens.";
  - depois de reabrir, o cardápio volta a aceitar itens.
- **Auditoria:** categoria "Pedidos". A entrada aparece como "Reabriu a conta · Pedido 42 · Mesa 2 · Motivo: … · já pago R$ 50,00"; o trecho "já pago" só aparece quando o valor é maior que zero.
- Botões novos com alvo de toque de 44 px.

## Critérios de aceite

- [ ] `GET /tables` traz `orderStatus` do pedido ativo (`null` na mesa livre).
- [ ] **Reabertura:**
  - garçom, caixa e gerente reabrem uma conta `ready_to_pay`, que volta para `in_kitchen`; cozinha → `403`;
  - a partir de `open`, `in_kitchen`, `closed` ou `canceled` → `409`; inexistente → `404`; motivo inválido → `422`;
  - depois de reabrir: adicionar item, enviar, cozinha pronta, pedir a conta de novo e encerrar com o saldo correto;
  - pagamento parcial anterior continua valendo e aparece em `paidAmount`.
- [ ] **Auditoria:** `order.reopened` na categoria `orders`; o teste de cobertura das categorias continua passando.
- [ ] **Telas:** tag no Salão e no Caixa, ordenação no Caixa e "Reabrir conta" na Comanda e no Caixa.
- [ ] **Testes:**
  - integração no backend;
  - Vitest (Salão, Caixa, Comanda e texto da auditoria);
  - Cypress (no ciclo completo: tag no Salão e no Caixa, reabrir, lançar mais um item, pedir a conta de novo e encerrar).
- [ ] **Documentação:**
  - `frontend/CONTRATO-API.md`;
  - `docs/ESPECIFICACAO.md` (RN-03 e RN-20);
  - `docs/ROTEIRO-DEMO.md`.

## Fora de escopo

- Estorno de pagamento ou troca de forma de pagamento.
- Transferir a comanda para outra mesa ou juntar mesas.
- Limitar quantas vezes uma conta pode ser reaberta.
