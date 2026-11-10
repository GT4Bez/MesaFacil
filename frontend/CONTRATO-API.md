# Contrato esperado entre frontend e backend

Base URL em `VITE_API_URL` (padrão `http://localhost:3001`). Todas as rotas, exceto o login,
recebem `Authorization: Bearer <token>`.

Papéis, estados e rotas seguem o `README.md` da raiz; o envelope de resposta segue o
`docs/SPRINT_1.md`.

## Envelope

- Sucesso: `{ "success": true, "data": ... }` — os formatos abaixo descrevem o conteúdo de `data`.
- Erro: `{ "success": false, "error": "mensagem" }` — o frontend exibe `error` ao usuário.

## Autenticação

- `POST /auth/login` — body `{ "email": "garcom@mesafacil.com", "password": "123" }`.
  Resposta: `{ "token": "jwt", "user": { "id": "1", "name": "Nome", "email": "...", "role": "waiter" } }`.
  Papéis: `waiter`, `kitchen`, `cashier`, `manager`.

## Turno e mesas

- `GET /shifts/active` — `{ id, status: "open" }` ou `null` quando não há turno aberto.
- `POST /shifts` — abre o turno (gerente).
- `PATCH /shifts/:id/close` — encerra o turno; `409` se houver pedido ativo (RN-02).
- `GET /tables` — array de `{ id, number, status, activeOrderId }`, com `status` igual a
  `available` ou `occupied` e `activeOrderId` preenchido nas mesas ocupadas.
- `POST /orders` — body `{ "tableId": 1 }`; resposta `{ "id": 123 }`. `409` se a mesa já tiver
  pedido aberto (RN-01) ou se não houver turno aberto (RN-02).

## Comanda

- `GET /orders/:id` — `{ id, status, createdAt, table: { number }, items }`, com cada item no
  formato `{ id, name, quantity, unitPrice, notes, status }`.
- `GET /menu-items` — array de `{ id, name, category, price }` (apenas itens disponíveis).
- `POST /orders/:id/items` — body `{ "menuItemId": 1, "quantity": 2, "notes": "sem cebola" }`.
- `PATCH /order-items/:id/quantity` — body `{ "quantity": 2 }`; só para item `pending` (RN-04).
- `PATCH /order-items/:id/status` — body `{ "status": "canceled" }` remove um item `pending`.
- `PATCH /orders/:id/status` — body `{ "status": "in_kitchen" | "ready_to_pay" | "closed" }`.
  Transição inválida deve ser rejeitada (RN-03, RN-06, RN-07).

## Caixa

- `GET /orders/:id/bill?serviceTax=true|false` — resposta:
  `{ "items": [{ "id": 1, "name": "Prato", "quantity": 2, "unitPrice": 25 }], "subtotal": 50, "serviceTaxAmount": 5, "total": 55, "remainingBalance": 55, "payments": [{ "id": 1, "amount": 20, "method": "cash", "createdAt": "..." }] }`.
  O backend calcula todos os valores, com ou sem a taxa de serviço (RN-08).
- `POST /orders/:id/payments` — body `{ "amount": 20, "method": "cash" }`.
  Métodos: `cash`, `card`, `pix`.
- Encerramento: `PATCH /orders/:id/status` com `{ "status": "closed" }`; `409` se restar saldo
  (RN-07). O frontend só habilita o botão quando `remainingBalance <= 0`.
