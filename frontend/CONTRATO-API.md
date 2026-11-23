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
- **Limite de tentativas (RN-19):** 5 senhas erradas em 15 minutos bloqueiam por 15 minutos o login (por e-mail),
  a autorização do gerente (por caixa que pede) e a troca da própria senha (por usuário). Durante o bloqueio, a rota
  responde `429` com `code: "TOO_MANY_ATTEMPTS"` e "Muitas tentativas. Tente novamente em N minutos.", mesmo com a
  senha certa. O `429` não encerra a sessão. Redefinir a senha pelo admin desbloqueia o usuário.

## Usuários e conta (RN-16)

- O token JWT é conferido no banco a cada requisição. `401` com usuário desativado, removido ou
  token revogado (desativação, rebaixamento de admin, troca ou redefinição de senha): o frontend volta ao login.
- O papel `admin` passa em todas as checagens de papel.
- Usuário: `{ id, name, email, role, active, createdAt }` (nunca devolve hash de senha).
- `GET /users?role=waiter&active=true` — só `admin`; filtros opcionais; ordenado por nome.
- `POST /users` — `{ name, email, role, password }` → `201` com o usuário. E-mail é gravado em minúsculas.
- `PATCH /users/:id` — subconjunto de `{ name, email, role, active }`. Não existe `DELETE`.
- `PUT /users/:id/password` — `{ password }` → `{ id }`.
- `GET /me` — usuário logado (todos os papéis).
- `PATCH /me/password` — `{ currentPassword, newPassword }` → `{ id }`; revoga o token atual (novo login).
- Erros: `403` papel; `404` usuário inexistente; `409` e-mail repetido, último admin ativo ou
  autodesativação/autorrebaixamento; `422` validação (nome 1–100, e-mail válido, senha 8–72) ou senha atual errada;
  `429` troca de senha bloqueada por tentativas (RN-19).

## Turno e mesas

- `GET /shifts/active` — `{ id, status: "open", countedAt, withdrawalApprovalLimit }` ou `null` quando não há turno aberto. `countedAt` é o horário da contagem cega (ou `null`), sem valores (RN-14); `withdrawalApprovalLimit` é o limite da sangria do caixa sem autorização (RN-18).
- `POST /shifts` — abre o turno (gerente). Body `{ "openingFloat": 100 }` (fundo de troco, `≥ 0`; ausente/inválido → `422`, RN-13).
- `POST /shifts/:id/cash-movements` — sangria/reforço (caixa e gerente). Body `{ "type": "withdrawal" | "reinforcement", "amount": 50, "reason": "Cofre" }`.
  RN-18: sangria do `cashier` acima de `withdrawalApprovalLimit` exige `"approver": { "email", "password" }` de um gerente/admin
  (`422` sem ele, com o limite na mensagem; `403` "Autorização do gerente inválida."; `429` pela RN-19). Até o limite, a sangria
  do caixa não é comparada com o esperado. A resposta traz `approvedBy: { id, name }` ou `null`.
  Resposta `201` `{ id, type, amount, reason, createdAt }`; só para gerente/admin vem também `expectedCash`.
  `422` sem motivo, valor inválido ou sangria do gerente/autorizada maior que a gaveta (a mensagem não revela o valor); `409` turno encerrado.
- `GET /shifts/:id/cash-movements` — `[{ id, type, amount, reason, by, approvedBy, createdAt }]` (caixa e gerente), o fundo primeiro; nunca traz o esperado. `approvedBy` é o nome de quem autorizou a sangria (RN-18) ou `null`.
- `PUT /shifts/:id/count` — contagem cega do caixa (`cashier`; gerente → `403`). Body
  `{ "declared": { "cash": 412.5, "card": 980, "pix": 310 }, "note": "opcional" }`. Resposta `{ shiftId, countedAt, declared, note }`,
  **sem o esperado**. `422` declarado ausente/negativo; `409` turno encerrado ou com pedido ativo. Recontar substitui (RN-14).
- `PATCH /shifts/:id/close` — encerra o turno (gerente). Body opcional `{ "reason": "..." }`. `409` com pedido ativo (RN-02),
  sem contagem ou com contagem desatualizada (houve pagamento/movimento depois dela); `422` sem motivo quando há diferença.
  Resposta: o turno com `closing: { countedBy, countedAt, note, reason, methods: [{ method, declared, expected, difference }] }` (RN-14).
- `GET /shifts/:id/report` — relatório do turno (gerente; `404` se não existir), parcial enquanto aberto (RN-10):
  `{ shift: { id, status, openedAt, closedAt, openedBy, closedBy }, totalShift, ordersClosed, averageTicket,
  byPaymentMethod: [{ method, total, count }], byMenuItem: [{ menuItemId, name, quantity, total }],
  cancellations: { ordersCount, orders: [{ orderId, reason, by }], items: [{ orderItemId, name, quantity, reason, by }] },
  cash: { openingFloat, cashPayments, withdrawals, reinforcements, expected, movements: [{ id, type, amount, reason, by, createdAt }] } }`.
  `cash.expected` = fundo + dinheiro líquido de troco − sangrias + reforços (RN-13).
  `byPaymentMethod` sempre traz `cash`, `card` e `pix`; `byMenuItem` vem do maior para o menor total;
  `cancellations.items` lista só cancelamentos gerenciais de pedidos não cancelados.
  RN-14: `closing` é `null` sem contagem; senão `{ countedBy, countedAt, note, reason, stale,
  methods: [{ method, declared, expected, difference }] }` (`methods` sempre em `cash`, `card`, `pix`;
  `reason` é o motivo do gerente no encerramento; `stale` só faz sentido com o turno aberto e indica que
  houve pagamento ou movimento depois da contagem).
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
  Com pagamento registrado, recusa com `409` se o valor pago passaria do novo total (RN-17, vale também para `pending`).
- `POST /order-items/:id/authorized-cancel` — só `cashier` (e `admin`). Body
  `{ "reason": "Cliente não recebeu o prato", "approver": { "email": "gerente@mesafacil.com", "password": "..." } }`.
  Resposta `{ "id": "21", "status": "canceled", "approvedBy": { "id": "4", "name": "Gerente" } }` (RN-17).
  Erros: `422` sem motivo/autorização; `403` "Autorização do gerente inválida." (não encerra a sessão);
  `429` autorização bloqueada por tentativas (RN-19); `404` item inexistente; `409` item já cancelado, pedido inativo ou pago acima do novo total.
- `PATCH /orders/:id/status` — body `{ "status": "in_kitchen" | "ready_to_pay" | "closed" }`.
  Transição inválida deve ser rejeitada (RN-03, RN-06, RN-07).
- Cancelar o pedido: `{ "status": "canceled", "reason": "cliente desistiu" }` — só `manager` (`403`),
  motivo obrigatório (`422`), `409` se houver pagamento registrado. Cancela os itens ativos e libera a mesa (RN-11).

## Insumos e ficha técnica (gerente, RN-15)

- `GET /ingredients` — `[{ id, name, unit, stockQuantity, minStock, unitCost, active, belowMin }]` (`unit`: `un`, `kg`, `l`).
- `POST /ingredients` — `{ "name": "Batata", "unit": "kg", "minStock": 5, "unitCost": 6.2 }` → `201`; nome repetido → `409`.
- `PATCH /ingredients/:id` — subconjunto de `{ name, minStock, unitCost, active }`; mudar `unit` → `422`.
- `POST /ingredients/:id/purchases` — `{ "quantity": 20, "unitCost": 6.4 }` → `201` com o insumo (custo passa a ser o da compra).
- `POST /ingredients/:id/adjustments` — `{ "countedQuantity": 18.25, "reason": "Perda" }` → `201`; sem diferença → `422`.
- `GET /ingredients/:id/movements?limit=50&before=120&type=sale` — histórico do insumo (spec 016), do mais recente
  para o mais antigo: `{ ingredient, consistent, movements: [{ id, type, quantity, unitCost, balanceAfter, createdAt, by,
  reason, shiftId, sale: { orderId, tableNumber, menuItem, itemQuantity } | null }], nextBefore }`. `limit` de 1 a 100
  (padrão 50), `before` = id do último movimento recebido, `type` = `purchase` | `adjustment` | `sale` (inválidos → `422`).
  `balanceAfter` considera todos os tipos, mesmo com filtro; `consistent: false` quando o estoque não bate com a soma
  dos movimentos; `nextBefore: null` na última página. Insumo inexistente → `404`.
- `GET /menu-items/:id/recipe` / `PUT /menu-items/:id/recipe` (`{ "items": [{ "ingredientId": "1", "quantity": 0.4 }] }`) →
  `{ menuItemId, price, items: [{ ingredientId, name, unit, quantity, unitCost, cost, active }], cost, margin, marginPercent }`.
  Insumo repetido ou quantidade ≤ 0 → `422`; insumo inativo → `409`.
- A baixa de estoque acontece sozinha no envio à cozinha; o relatório do turno traz o bloco
  `cmv: { revenue, cost, grossMargin, marginPercent, losses, soldItems, itemsWithRecipe }`.

## Cozinha (KDS)

- `GET /kitchen/orders` — `kitchen` e `manager`. Itens `sent` e `preparing` de pedidos ativos, agrupados por
  pedido, do envio mais antigo para o mais novo:
  `[{ "orderId": "12", "table": { "number": 4 }, "items": [{ "id": "40", "name": "Picanha na Chapa", "quantity": 2, "notes": "ao ponto", "status": "sent", "sentAt": "2026-11-18T19:02:11Z" }] }]`.
- Transições pela rota existente `PATCH /order-items/:id/status` (`sent → preparing → ready`).
- `sentAt` é gravado no envio à cozinha (`PATCH /orders/:id/status` com `in_kitchen`) e nunca muda.

## Caixa

- `GET /orders/:id/bill` — resposta:
  `{ "orderId": "1", "status": "ready_to_pay", "serviceTax": false, "items": [{ "id": 1, "name": "Prato", "quantity": 2, "unitPrice": 25 }], "subtotal": 50, "serviceTaxAmount": 0, "total": 50, "remainingBalance": 50, "payments": [{ "id": 1, "amount": 20, "changeAmount": 0, "method": "cash", "createdAt": "..." }] }`.
  O backend calcula todos os valores com base em `orders.service_tax` e desconta `changeAmount` do saldo (RN-08, RN-12).
- `PATCH /orders/:id/service-tax` (`cashier` e `manager`) — body `{ "enabled": true }` → devolve a conta atualizada (`409` se encerrado/cancelado ou se desligar com valor já pago acima do subtotal).
- `POST /orders/:id/payments` — body `{ "amount": 20, "method": "cash" }`; resposta `{ "id": "1", "amount": 20, "changeAmount": 0, "remainingBalance": 30 }`.
  Métodos: `cash`, `card`, `pix`. Dinheiro acima do saldo calcula `changeAmount`; cartão/Pix acima do saldo retornam `422`; pedido já quitado retorna `409`.
- Encerramento: `PATCH /orders/:id/status` com `{ "status": "closed" }`; `409` se restar saldo considerando a taxa persistida (RN-07, RN-12). O frontend só habilita o botão quando `remainingBalance <= 0`.
