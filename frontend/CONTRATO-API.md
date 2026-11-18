# Contrato esperado entre frontend e backend

Base URL em `VITE_API_URL` (padrão `http://localhost:3001`). Todas as rotas, exceto o login,
recebem `Authorization: Bearer <token>`.

Papéis, estados e rotas seguem o `README.md` da raiz; o envelope de resposta segue o
`docs/SPRINT_1.md`.

## Navegação por papel (frontend)

A matriz de telas por papel fica em `src/utils/access.js` (home e menu de cada papel); rota fora do papel
redireciona para a home. O backend continua respondendo `403` como barreira real.

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
- `GET /shifts/:id/report` — relatório do turno (gerente; `404` se não existir), parcial enquanto aberto (RN-10):
  `{ shift: { id, status, openedAt, closedAt, openedBy }, totalShift, ordersClosed, averageTicket,
  byPaymentMethod: [{ method, total, count }], byMenuItem: [{ menuItemId, name, quantity, total }],
  cancellations: { ordersCount, orders: [{ orderId, reason, by }], items: [{ orderItemId, name, quantity, reason, by }] } }`.
  `byPaymentMethod` sempre traz `cash`, `card` e `pix`; `byMenuItem` vem do maior para o menor total;
  `cancellations.items` lista só cancelamentos gerenciais de pedidos não cancelados.
- `GET /tables` — array de `{ id, number, status, activeOrderId }`, com `status` igual a
  `available` ou `occupied` e `activeOrderId` preenchido nas mesas ocupadas.
- `POST /orders` — body `{ "tableId": 1 }`; resposta `{ "id": 123 }`. `409` se a mesa já tiver
  pedido aberto (RN-01) ou se não houver turno aberto (RN-02).

## Comanda

- `GET /orders/:id` — `{ id, status, createdAt, table: { number }, cancellation, items }`, com cada item no
  formato `{ id, name, quantity, unitPrice, notes, status }`. `cancellation` é
  `{ reason, canceledBy: { id, name } }` no pedido cancelado com motivo, senão `null`.
- `GET /menu-items` — array de `{ id, name, category, price }` (apenas itens disponíveis).

## Administração do cardápio (gerente)

- `GET /menu-items?all=true` — todos os itens, inclusive fora de linha: `{ id, name, category, price, available }`.
- `GET /menu-items/categories` — categorias já usadas, em ordem alfabética (`["Bebidas", "Pratos"]`).
- `POST /menu-items` — body `{ "name": "Moqueca", "category": "Pratos", "price": 79.9, "available": true }`
  (`available` opcional, padrão `true`). Resposta `201` com o item criado.
- `PATCH /menu-items/:id` — qualquer subconjunto de `{ name, category, price, available }`.
  Não existe `DELETE`: o item sai de linha com `available: false` e o preço já lançado em pedidos não muda (RN-09).
- Erros: `403` papel, `404` item inexistente, `422` validação (nome 1–100, categoria 1–50, preço ≥ 0).
- `POST /orders/:id/items` — body `{ "menuItemId": 1, "quantity": 2, "notes": "sem cebola" }`.
- `PATCH /order-items/:id/quantity` — body `{ "quantity": 2 }`; só para item `pending` (RN-04).
- `PATCH /order-items/:id/status` — body `{ "status": "canceled" }` remove um item `pending`.
  Item já enviado: só `manager`, com `{ "status": "canceled", "reason": "..." }` (RN-05; `403`/`422`).
- `PATCH /orders/:id/status` — body `{ "status": "in_kitchen" | "ready_to_pay" | "closed" }`.
  Transição inválida deve ser rejeitada (RN-03, RN-06, RN-07).
- Cancelar o pedido: `{ "status": "canceled", "reason": "cliente desistiu" }` — só `manager` (`403`),
  motivo obrigatório (`422`), `409` se houver pagamento registrado. Cancela os itens ativos e libera a mesa (RN-11).

## Cozinha (KDS)

- `GET /kitchen/orders` — `kitchen` e `manager`. Itens `sent` e `preparing` de pedidos ativos, agrupados por
  pedido, do envio mais antigo para o mais novo:
  `[{ "orderId": "12", "table": { "number": 4 }, "items": [{ "id": "40", "name": "Picanha na Chapa", "quantity": 2, "notes": "ao ponto", "status": "sent", "sentAt": "2026-11-18T19:02:11Z" }] }]`.
- Transições pela rota existente `PATCH /order-items/:id/status` (`sent → preparing → ready`).
- `sentAt` é gravado no envio à cozinha (`PATCH /orders/:id/status` com `in_kitchen`) e nunca muda.

## Caixa

- `GET /orders/:id/bill?serviceTax=true|false` — resposta:
  `{ "items": [{ "id": 1, "name": "Prato", "quantity": 2, "unitPrice": 25 }], "subtotal": 50, "serviceTaxAmount": 5, "total": 55, "remainingBalance": 55, "payments": [{ "id": 1, "amount": 20, "method": "cash", "createdAt": "..." }] }`.
  O backend calcula todos os valores, com ou sem a taxa de serviço (RN-08).
- `POST /orders/:id/payments` — body `{ "amount": 20, "method": "cash" }`.
  Métodos: `cash`, `card`, `pix`.
- Encerramento: `PATCH /orders/:id/status` com `{ "status": "closed" }`; `409` se restar saldo
  (RN-07). O frontend só habilita o botão quando `remainingBalance <= 0`.
