# 🎬 Roteiro de Demonstração — MesaFácil

Guia para apresentar as regras de negócio na prática, em cerca de 15 minutos: primeiro pela interface, contando a história de um atendimento, depois provando pela API que o backend bloqueia o que a tela já esconde.

## 1. Preparação (antes da banca)

```bash
cp .env.example .env              # troque JWT_SECRET=changeme por uma chave própria
docker compose down -v            # banco do zero: migrations e seeds reaplicados
docker compose up --build
```

- Frontend: `http://localhost:5173` · API: `http://localhost:3001`
- Usuários (senha `123`, só para ambiente local): `gerente@`, `garcom@`, `cozinha@` e `caixa@mesafacil.com`.
- Deixe quatro janelas anônimas abertas, uma por perfil, para alternar sem logout.
- O seed já traz um turno **encerrado** e três pedidos fechados (histórico); a demo começa com o turno fechado.

## 2. Roteiro pela interface

| # | Perfil | Ação na tela | O que mostrar | Regra |
| :-- | :-- | :-- | :-- | :-- |
| 1 | Garçom | Abrir **Salão e mesas** | Banner "Turno fechado" e mesas livres desabilitadas | RN-02 |
| 2 | Gerente | **Abrir turno** no banner | Mesas liberadas; o menu do gerente mostra todas as telas | RN-02 |
| 3 | Garçom | Clicar na mesa 1 → comanda; lançar 1× Picanha na Chapa e 2× Suco Natural | Item pendente com quantidade editável e "×" para remover | RN-04 |
| 4 | Garçom | Voltar ao salão e clicar de novo na mesa 1 | Mesa ocupada abre a **mesma** comanda, nunca um segundo pedido | RN-01 |
| 5 | Garçom | **Enviar para a cozinha** | Itens viram "Enviado" e perdem a edição; "Pedir a conta" segue desabilitado | RN-03, RN-04, RN-06 |
| 6 | Cozinha | Tela **Cozinha (KDS)** (home da cozinha) | Cartão da mesa 1 com tempo de espera; atualiza sozinho a cada 5 s | KDS |
| 7 | Gerente | Na comanda, "×" no Suco Natural já enviado | Modal exige motivo; o item fica "Cancelado" | RN-05 |
| 8 | Cozinha | **Iniciar preparo** → **Pronto ✓** na picanha | Cartão some do KDS quando tudo fica pronto | RN-06 |
| 9 | Garçom | **Pedir a conta** | Botão só habilita depois da cozinha | RN-06 |
| 10 | Caixa | **Frente de caixa** → mesa 1; marcar e desmarcar "Incluir 10% de taxa de serviço" | Total recalculado pelo backend, sem o suco cancelado | RN-08 |
| 11 | Caixa | Pagar R$ 50,00 em Pix | "Finalizar pedido e liberar mesa" bloqueado enquanto há saldo devedor | RN-07 |
| 12 | Caixa | Pagar o saldo em dinheiro e finalizar | Mesa 1 volta a "Livre" no salão | RN-07 |
| 13 | Gerente | **Admin do cardápio**: mudar o preço da picanha e tirar o Pudim de linha | Pudim some do cardápio do garçom; pedidos antigos mantêm o preço | RN-09 |
| 14 | Garçom + Gerente | Abrir a mesa 2 com um item; gerente usa **Cancelar pedido** com motivo | Mesa liberada; comanda mostra quem cancelou e por quê | RN-11 |
| 15 | Gerente | **Turno e relatório** → **Encerrar turno** | Relatório fechado: total, ticket médio, formas de pagamento, itens e cancelamentos | RN-02, RN-10 |

> Dica: no passo 14, se o caixa registrar um pagamento antes, o cancelamento é recusado (`409`): pedido pago não é cancelado.

## 3. Prova pela API

A tela esconde o que cada perfil não pode fazer. Para mostrar que a **barreira real está no backend**, rode com o banco recém-criado:

```bash
./scripts/demo-regras.sh            # ou ./scripts/demo-regras.sh http://outro-host:3001
```

O script percorre o fluxo inteiro com `curl` e imprime cada resposta com o status HTTP:

| Regra | O que o script tenta | Resposta esperada |
| :-- | :-- | :-- |
| Erros | Chamar `/tables` sem token | `401` com `{ success: false, error, code }` |
| RN-02 | Abrir pedido sem turno; garçom abrindo turno; encerrar turno com pedido ativo | `409`, `403`, `409` |
| RN-01 | Segundo pedido na mesma mesa | `409` (índice único parcial no PostgreSQL) |
| RN-03 | Pedido `open` direto para `closed` | `409` |
| RN-04 | Alterar quantidade de item já enviado | `409` |
| RN-05 | Garçom cancelando item enviado; gerente sem motivo | `403`, `422` |
| RN-06 | Pedir a conta com item em preparo | `409` |
| RN-07 | Encerrar com saldo em aberto | `409` |
| RN-08 | Conta com `serviceTax=true` | `98,89` = `89,90` + 10%, sem o item cancelado |
| RN-11 | Garçom cancelando pedido; gerente sem motivo | `403`, `422` |
| RN-10 | Caixa pedindo o relatório; gerente pedindo o relatório | `403`, `200` com totais por SQL |

Nenhuma resposta de erro expõe SQL, nome de tabela ou stack trace: erros do PostgreSQL passam por `translatePgError` e chegam como mensagem de negócio.

## 4. Onde cada regra é garantida

| Regra | Serviço / rota | Proteção no banco | Teste automatizado |
| :-- | :-- | :-- | :-- |
| RN-01 | `OrderService.create` | `orders_single_active_per_table_idx` | `orders.test.js` |
| RN-02 | `OrderService.create`, `ShiftService.close` | `shifts_single_open_idx` | `orders.test.js` |
| RN-03 | `OrderService.updateStatus` | `orders_status_check` | `orders.test.js` |
| RN-04 | `OrderService.updateItemQuantity` | trava `FOR UPDATE` no pedido | `orders.test.js` |
| RN-05 | `OrderService.updateItemStatus` | `order_items_cancellation_reason_check` | `orders.test.js`, `audit.test.js` |
| RN-06 | `OrderService.updateStatus` (`ready_to_pay`) | — | `orders.test.js` |
| RN-07 | `OrderService.updateStatus` (`closed`) | trava `FOR UPDATE` no pedido | `orders.test.js` |
| RN-08 | `OrderService.getBill` | — | `orders.test.js` |
| RN-09 | `OrderService.addItem`, `MenuItemService` | `order_items.unit_price` | `orders.test.js`, `menuItems.test.js` |
| RN-10 | `ShiftService.getReport` | agregações SQL em `REPEATABLE READ` | `shiftReport.test.js` |
| RN-11 | `OrderService.updateStatus` (`canceled`), `AuditLogService` | `orders_cancellation_reason_check`, `audit_logs_action_check` | `audit.test.js` |

Os testes rodam contra PostgreSQL real a cada PR (CI no GitHub Actions); veja "Executando os Testes Automatizados" no [README](../README.md).
