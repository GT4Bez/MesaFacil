# 001 — Testes de integração e CI

> Status: proposta · Regras: RN-01 a RN-10 (base para testar todas)

## Contexto

Os testes atuais (`backend/tests/ordersFlow.test.js`) usam um simulador de SQL escrito à mão que imita as migrations 001–007. Ele não executa os `CHECK`, índices parciais e travas do Postgres — justamente onde moram RN-01, RN-02 e RN-05 — e cada query nova das próximas specs teria de ser reimplementada nele. Também não há CI.

## Regras

1. Os testes de backend rodam contra um **Postgres real** (banco de teste), com o schema criado a partir de `sql/migrations/*.sql` em ordem.
2. Cada teste começa com o banco limpo (`TRUNCATE … RESTART IDENTITY CASCADE`) e cria só os dados de que precisa, por meio de *factories* (usuário, turno, mesa, item de cardápio, pedido).
3. Os testes chamam a API por HTTP (`app` do Express) com tokens JWT reais dos 4 papéis.
4. O simulador é mantido apenas até os testes de `ordersFlow` serem portados; depois é removido.
5. Todo PR roda o CI; PR com CI vermelho não é revisado.

## Modelo de dados

Sem mudanças. O banco de teste é `mesafacil_test`, configurado por `TEST_DATABASE_URL`.

## Estrutura

- `backend/tests/support/db.js` — cria o schema (aplica as migrations uma vez por execução), `resetDb()` e fecha o pool.
- `backend/tests/support/factories.js` — `createUser(role)`, `openShift()`, `createTable()`, `createMenuItem()`, `createOrder()`, `tokenFor(user)`.
- `backend/tests/integration/*.test.js` — um arquivo por área (auth, shifts, orders, cashier…).
- `backend/package.json` — `test` (unitários + integração) e `test:integration`.
- `.github/workflows/ci.yml`:
  - `services: postgres:16-alpine` com healthcheck;
  - job **backend**: `bun install` → `bun run test` com `TEST_DATABASE_URL` apontando para o service;
  - job **frontend**: `bun install` → `bun run build`.
- README §10: como rodar os testes localmente (`docker compose up -d db` + criar `mesafacil_test`).

## Critérios de aceite

- [ ] `bun run test` no `backend/` passa localmente com o Postgres do compose.
- [ ] Os cenários de `ordersFlow.test.js` (RN-01 a RN-09) estão portados para integração e o simulador foi removido.
- [ ] Violar `orders_single_active_per_table_idx` e `shifts_single_open_idx` é testado de verdade (sem simulação).
- [ ] O workflow roda em `pull_request` e `push` na `main` e fica verde.

## Fora de escopo

- Testes E2E de navegador.
- Testes de frontend (componentes).
