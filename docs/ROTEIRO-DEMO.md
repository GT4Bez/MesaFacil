# 🎬 Roteiro de Demonstração — MesaFácil

Guia para apresentar as regras de negócio na prática, em cerca de 20 minutos: primeiro pela interface, contando a história de um atendimento, depois provando pela API que o backend bloqueia o que a tela já esconde.

## 1. Preparação (antes da banca)

```bash
cp .env.example .env              # troque JWT_SECRET=changeme por uma chave própria
docker compose down -v            # banco do zero: migrations e seeds reaplicados
docker compose up --build
```

- Frontend: `http://localhost:5173` · API: `http://localhost:3001`
- Usuários (senha `123`, só para ambiente local): `admin@`, `gerente@`, `garcom@`, `cozinha@` e `caixa@mesafacil.com`.
- Deixe cinco janelas anônimas abertas, uma por perfil, para alternar sem logout.
- O seed já traz um turno **encerrado** e três pedidos fechados (histórico); a demo começa com o turno fechado.

## 2. Roteiro pela interface

| # | Perfil | Ação na tela | O que mostrar | Regra |
| :-- | :-- | :-- | :-- | :-- |
| 1 | Garçom | Abrir **Salão e mesas** | Banner "Turno fechado" e mesas livres desabilitadas | RN-02 |
| 2 | Gerente | Informar o **Fundo de troco** (R$ 100,00) e **Abrir turno** no banner | Sem fundo, o turno não abre; mesas liberadas; o menu do gerente mostra todas as telas | RN-02, RN-13 |
| 3 | Garçom | Clicar na mesa 1 → comanda; lançar 1× Picanha na Chapa e 2× Suco Natural | Item pendente com quantidade editável e "×" para remover | RN-04 |
| 4 | Garçom | Voltar ao salão e clicar de novo na mesa 1 | Mesa ocupada abre a **mesma** comanda, nunca um segundo pedido | RN-01 |
| 5 | Garçom | **Enviar para a cozinha** | Itens viram "Enviado" e perdem a edição; "Pedir a conta" segue desabilitado | RN-03, RN-04, RN-06 |
| 6 | Cozinha | Tela **Cozinha (KDS)** (home da cozinha) | Cartão da mesa 1 com tempo de espera; atualiza sozinho a cada 5 s | KDS |
| 7 | Gerente | Na comanda, "×" no Suco Natural já enviado | Modal exige motivo; o item fica "Cancelado" | RN-05 |
| 8 | Cozinha | **Iniciar preparo** → **Pronto ✓** na picanha | Cartão some do KDS quando tudo fica pronto | RN-06 |
| 9 | Garçom | **Pedir a conta** | Botão só habilita depois da cozinha | RN-06 |
| 10 | Caixa | **Frente de caixa** → mesa 1; marcar "Incluir 10% de taxa de serviço" | A taxa começa desligada e, marcada, fica gravada no pedido; total de R$ 98,89 sem o suco cancelado | RN-08, RN-12 |
| 11 | Caixa | Pagar R$ 50,00 em Pix; depois digitar R$ 60,00 ainda em Pix | "Finalizar pedido e liberar mesa" bloqueado com saldo devedor; em cartão/Pix o valor é limitado ao saldo | RN-07, RN-12 |
| 12 | Caixa | Trocar para Dinheiro, pagar R$ 60,00 e finalizar | "Troco: R$ 11,11"; o histórico mostra recebido e troco; mesa 1 volta a "Livre" | RN-07, RN-12 |
| 13 | Gerente | **Admin do cardápio**: mudar o preço da picanha e tirar o Pudim de linha; abrir a **Ficha técnica** da picanha. Em **Insumos**, ver a baixa do envio (Picanha 11,600 kg), o alerta do leite condensado e registrar uma entrada | Pudim some do cardápio do garçom; pedidos antigos mantêm o preço; a ficha mostra custo e margem; a entrada atualiza estoque e custo | RN-09, RN-15 |
| 14 | Garçom + Gerente | Abrir a mesa 2 com um item; gerente usa **Cancelar pedido** com motivo | Mesa liberada; comanda mostra quem cancelou e por quê | RN-11 |
| 15 | Garçom + Caixa | Na mesa 3, lançar e enviar um item; no **Frente de caixa**, "×" no item e o gerente digita e-mail e senha no modal (errar a senha primeiro) | Senha errada mostra "Autorização do gerente inválida." sem derrubar o caixa; com a certa, o item sai da conta com "autorizado por Gerente" | RN-17 |
| 16 | Gerente | **Turno e relatório** → **Encerrar turno** | Relatório fechado: total, ticket médio, formas de pagamento, itens, cancelamentos e o dinheiro esperado na gaveta (fundo + dinheiro líquido de troco) | RN-02, RN-10, RN-13 |
| 17 | Admin | Entrar como `admin@` | A home é **Usuários**; o menu tem todas as telas; o admin pode abrir turno, cancelar e receber como qualquer papel | RN-16 |
| 18 | Admin | Cadastrar "Ana", e-mail `Ana@MesaFacil.com`, papel Garçom, senha de 8+ caracteres | E-mail gravado em minúsculas; senha curta é recusada | RN-16 |
| 19 | Admin + Garçom | Admin desativa o Garçom; o garçom clica em qualquer tela | A sessão cai na hora: volta ao login com "Sua sessão foi encerrada"; o login dele é recusado | RN-16 |
| 20 | Admin | Na própria linha, não há "Desativar"; **Redefinir senha** do Caixa | O admin não remove a si mesmo; a senha nova encerra as sessões abertas do caixa | RN-16 |
| 21 | Cozinha | **Minha conta** → trocar a senha (errar a atual primeiro) | "Senha atual incorreta"; com a certa, volta ao login para entrar com a senha nova | RN-16 |
| 22 | Gerente | Abrir `/admin/users` na barra de endereço | Volta para a tela inicial: só o admin administra usuários | RN-16 |

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
| RN-08 | Garçom ligando a taxa; caixa ligando a taxa | `403`; conta de `98,89` = `89,90` + 10%, sem o item cancelado |
| RN-12 | Pix acima do saldo; dinheiro acima do saldo; pagar pedido quitado; desligar a taxa já paga | `422`; `201` com `changeAmount: 11.11`; `409`; `409` |
| RN-11 | Garçom cancelando pedido; gerente sem motivo | `403`, `422` |
| RN-13 | Abrir turno sem fundo; sangria acima da gaveta; garçom sangrando; caixa sangra 100; gerente reforça 20 | `422`; `422` sem revelar o valor; `403`; `201` sem `expectedCash`; `201` com `expectedCash: 68.89` |
| RN-10 | Caixa pedindo o relatório; gerente pedindo o relatório | `403`, `200` com totais por SQL e o bloco `cash` (`expected: 68.89`) |
| RN-15 | Estoque depois do envio; garçom ajustando estoque; ajuste sem motivo; com motivo; relatório | Picanha `11.6`, Laranja `14`; `403`; `422`; `201` (auditado); `cmv` com custo `30.07` e perda `34.74` (suco cancelado no RN-05 + picanha cancelada no RN-17) |
| RN-17 | Caixa cancela item com a senha errada do gerente; com a certa; com pago acima do novo total | `403` (sessão do caixa segue válida); `200` com `approvedBy`; `409` |
| RN-16 | Gerente listando usuários; admin cria "Ana" e a desativa; Ana usa o token antigo e tenta logar; admin desativa a si mesmo | `403`; `201`; `401` e `401`; `409` |

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
| RN-08 | `OrderService.getBill`, `OrderService.setServiceTax` | `orders.service_tax` | `orders.test.js` |
| RN-09 | `OrderService.addItem`, `MenuItemService` | `order_items.unit_price` | `orders.test.js`, `menuItems.test.js` |
| RN-10 | `ShiftService.getReport` | agregações SQL em `REPEATABLE READ` | `shiftReport.test.js` |
| RN-11 | `OrderService.updateStatus` (`canceled`), `AuditLogService` | `orders_cancellation_reason_check`, `audit_logs_action_check` | `audit.test.js` |
| RN-12 | `OrderService.addPayment` (fila com `FOR UPDATE`) | `payments_change_amount_check`, `payments_change_only_cash_check` | `orders.test.js`, `shiftReport.test.js` |
| RN-13 | `ShiftService.open`, `ShiftService.addCashMovement` (trava `FOR UPDATE` no turno), `CashMovementRepository.findCashSummary` | `cash_movements_amount_check`, `cash_movements_reason_check`, `cash_movements_single_float_idx` | `cashMovements.test.js` |
| RN-15 | `IngredientService`, `StockRepository.recordSales` (baixa no envio, insumos travados em ordem), `ShiftReportRepository.findCmv` | `stock_movements_sale_item_check`, `stock_movements_quantity_sign_check`, `ingredients_name_unique_idx` | `ingredients.test.js` |
| RN-17 | `AuthService.verifyApprover`, `OrderService.authorizedCancelItem` (trava `FOR UPDATE` depois da autorização), `#assertPaidFitsWithout` | `order_items.canceled_by`, `audit_logs_action_check` | `authorizedCancel.test.js` |
| RN-16 | `hasRole`, `authenticateToken` (confere `active`/`token_version`), `UserService` | `users_role_check`, `users_email_normalized_check`, trava `FOR UPDATE` nos admins ativos | `users.test.js` |

Os testes rodam contra PostgreSQL real a cada PR (CI no GitHub Actions); veja "Executando os Testes Automatizados" no [README](../README.md).
