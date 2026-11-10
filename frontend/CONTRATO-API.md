# Contrato esperado entre frontend e backend

Base URL configurada em `.env` com `VITE_API_URL`. Todas as rotas abaixo (exceto login) devem aceitar `Authorization: Bearer <token>`.

## Autenticação
- `POST /auth/login`
- Body: `{ "email": "operador@restaurante.com", "password": "123456" }`
- Resposta: `{ "token": "jwt", "user": { "id": 1, "name": "Nome", "role": "gerente" } }`

## Turno e mesas
- `GET /shifts/active` — turno ativo ou objeto vazio/null quando fechado.
- `POST /shifts` — abre turno.
- `PATCH /shifts/:id/close` — encerra turno; retornar HTTP 409 se houver mesas ocupadas.
- `GET /tables` — array de `{ id, number, status, activeOrderId }`.
- `POST /orders` — body `{ "tableId": 1 }`; resposta `{ "id": 123 }`.

## Comanda
- `GET /orders/:id` — comanda com `table`, `createdAt`, `status` e `items`.
- `GET /menu-items` — array de `{ id, name, description, category, price }`.
- `POST /orders/:id/items` — body `{ "menuItemId": 1, "quantity": 2, "observation": "sem cebola" }`.
- `PATCH /order-items/:id/quantity` — body `{ "quantity": 2 }`.
- `DELETE /order-items/:id`.
- `PATCH /orders/:id/send-to-kitchen`.
- `PATCH /orders/:id/ready-to-pay`.

## Caixa
- `GET /orders/:id/bill?serviceTax=true|false` — resposta esperada:
  `{ "items": [{ "id": 1, "name": "Prato", "quantity": 2, "unitPrice": 25 }], "subtotal": 50, "serviceTaxAmount": 5, "total": 55, "remainingBalance": 55, "payments": [] }`.
- `POST /orders/:id/payments` — body `{ "amount": 20, "method": "dinheiro" }`. Métodos: `dinheiro`, `cartão`, `pix`.
- `PATCH /orders/:id/close` — encerra a comanda e libera a mesa.

## Atenção para integração
1. Os nomes das rotas foram extraídos das tarefas fornecidas. Confirmem com o backend o prefixo (por exemplo `/api`) e se o login é realmente `/auth/login`.
2. O frontend espera que `GET /tables` retorne `activeOrderId` para mesas ocupadas.
3. O endpoint da conta deve recalcular `total` e `remainingBalance` conforme `serviceTax=true/false`. O frontend atualiza a consulta ao alternar o checkbox.
4. Cada pagamento parcial deve atualizar a lista de pagamentos e `remainingBalance`.
5. O botão de encerramento só habilita quando `remainingBalance` for zero ou menor.
6. Em erro HTTP 400/401/409, o frontend exibe mensagem ao usuário.
