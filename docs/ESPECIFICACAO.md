# 📋 Especificação Funcional e Regras de Domínio — MesaFácil

Documento de referência das regras de negócio, perfis operacionais e matriz de validação do sistema **MesaFácil**.

---

## 🎯 1. Escopo Operacional

O **MesaFácil** gerencia exclusivamente o atendimento presencial em restaurantes, bares e *food parks*, conectando **Salão**, **Cozinha** e **Caixa**.

> 📌 **Foco de Produto:** Funcionalidades externas ao atendimento de salão (como delivery, entregadores, cálculo de frete, geolocalização, integração com marketplaces e gateway de pagamento online real) não fazem parte do escopo operacional.

---

## 👥 2. Perfis e Permissões

| Papel (`role`) | Nome no Sistema | Responsabilidades |
| :--- | :--- | :--- |
| `waiter` | **Garçom** | Consultar mapa de mesas, abrir pedido, lançar/editar itens pendentes, enviar à cozinha e pedir a conta |
| `kitchen` | **Cozinha** | Visualizar itens enviados, iniciar preparo (`preparing`) e concluir preparo (`ready`) |
| `cashier` | **Caixa** | Consultar extrato da conta (com ou sem taxa de 10%), registrar pagamentos parciais e encerrar pedidos quitados |
| `manager` | **Gerente** | Abrir e fechar turnos, cancelar itens enviados mediante justificativa, gerir cardápio e relatórios |
| `admin` | **Administrador** | Superadmin (RN-16): passa em toda checagem de papel e é o único que cria, edita, desativa e redefine a senha de usuários |

---

## ⚖️ 3. Regras de Negócio

### 3.1 Núcleo Obrigatório (`RN-01` a `RN-07`)

- **RN-01 · Unicidade de pedido ativo por mesa**  
  Uma mesa não pode possuir dois pedidos ativos (`open`, `in_kitchen`, `ready_to_pay`) simultaneamente. Tentativas duplicadas retornam `409 Conflict`.
- **RN-02 · Obrigatoriedade de turno aberto**  
  Pedidos só são criados quando existe um turno com `status = 'open'`. O turno não pode ser encerrado enquanto houver pedidos ativos vinculados a ele (`409 Conflict`).
- **RN-03 · Máquina de estados do pedido**  
  Fluxo linear: `open` -> `in_kitchen` -> `ready_to_pay` -> `closed`. O cancelamento (`canceled`) é permitido apenas antes de `closed`. Transições fora da ordem são rejeitadas.
- **RN-04 · Máquina de estados do item e trava pós-envio**  
  Fluxo do item: `pending` -> `sent` -> `preparing` -> `ready` (ou `canceled`). Após sair do estado `pending`, garçom e caixa não podem alterar quantidade ou remover o item sem autorização gerencial.
- **RN-05 · Cancelamento de item enviado restrito ao gerente**  
  Itens nos estados `sent`, `preparing` ou `ready` só podem ser cancelados pelo perfil `manager` (`403 Forbidden` para outros papéis) e exigem justificativa não vazia (`422 Unprocessable Entity` se omitida), persistindo `canceled_by` e `cancellation_reason`.
- **RN-06 · Liberação para pagamento condicionada à cozinha**  
  O pedido só avança de `in_kitchen` para `ready_to_pay` quando todos os itens vinculados estiverem em `ready` ou `canceled`.
- **RN-07 · Encerramento condicionado à quitação integral**  
  São permitidos múltiplos pagamentos parciais (`cash`, `card`, `pix`). O pedido só transiciona para `closed` quando o saldo restante for menor ou igual a zero (`409 Conflict` caso haja saldo pendente), liberando a mesa (`available`).

### 3.2 Evoluções do Domínio (`RN-08` a `RN-10`)

- **RN-08 · Taxa de serviço opcional (10%)**  
  Calculada dinamicamente apenas sobre itens não cancelados.
- **RN-09 · Snapshot de preço e disponibilidade**  
  O valor `unit_price` é copiado de `menu_items.price` no momento do lançamento em `order_items`, preservando o histórico de pedidos anteriores caso o cardápio sofra reajuste. Itens com `available = false` não são exibidos para novos lançamentos no salão.
- **RN-10 · Fechamento financeiro do turno**  
  Consolidação do faturamento do turno derivada diretamente dos pagamentos registrados no banco de dados.

### 3.3 Evoluções da squad (`RN-11` em diante)

- **RN-11 · Cancelamento de pedido com motivo e trilha de auditoria** ([spec 005](specs/005-auditoria-e-cancelamento-de-pedido.md))  
  Cancelar o pedido inteiro é exclusivo do `manager` e exige motivo (`422`); pedido com pagamento registrado não pode ser cancelado (`409`). Os itens ainda ativos são cancelados com o mesmo responsável e motivo, e a mesa volta a `available`. Ações sensíveis (`order_item.canceled`, `order.canceled`, `shift.opened`, `shift.closed`, `menu_item.price_changed`) gravam uma linha em `audit_logs` na mesma transação da ação.
- **RN-12 · Taxa de serviço persistida, trava anti-overpayment e troco** ([spec 006](specs/006-taxa-de-servico-e-troco.md))  
  `orders.service_tax` é a fonte única de verdade da taxa de 10% (`PATCH /orders/:id/service-tax`); desligar a taxa com valor pago acima do novo subtotal retorna `409`. Na fila transacional de pagamentos, pedido já quitado retorna `409`, cartão/Pix acima do saldo retornam `422`, e dinheiro acima do saldo grava `change_amount = amount - saldo`, contabilizando no turno apenas o valor líquido (`amount - change_amount`).
- **RN-13 · Movimentos de caixa: fundo, sangria e reforço** ([spec 007](specs/007-movimentos-de-caixa.md))  
  O turno só abre com o fundo de troco (`openingFloat ≥ 0`, pode ser 0; senão `422`). Caixa e gerente registram sangria e reforço com valor positivo e motivo obrigatório (`422`), só em turno aberto (`409`). O dinheiro esperado na gaveta é fundo + Σ (`amount − change_amount`) dos pagamentos em dinheiro − sangrias + reforços, calculado por SQL num único método; sangria acima dele retorna `422` sem revelar o valor. O turno fica travado (`FOR UPDATE`) durante o movimento, e cada sangria/reforço grava `cash.withdrawal`/`cash.reinforcement` em `audit_logs`. O esperado só aparece para `manager`/`admin` (resposta do movimento e bloco `cash` do relatório), preservando a conferência cega da spec 008.
- **RN-17 · Cancelamento de item no caixa com autorização do gerente** ([spec 013](specs/013-cancelamento-autorizado-no-caixa.md))  
  O `cashier` cancela item de pedido ativo com motivo (`422`) e o e-mail e a senha de um `manager`/`admin` ativo, sem trocar de sessão (`POST /order-items/:id/authorized-cancel`). Qualquer falha na autorização responde `403` com a mesma mensagem, conferida antes de travar o pedido, e não encerra a sessão do caixa. O item fica com `canceled_by` = autorizador; `audit_logs` grava `order_item.canceled` com o caixa em `user_id` e `approvedBy` em `details`. Em qualquer cancelamento de item (RN-17, RN-05 ou item `pending`), se o valor já pago passaria do novo total, a API responde `409`, porque estorno não é suportado.
- **RN-16 · Administração de usuários e superadmin** ([spec 011](specs/011-usuarios-e-superadmin.md))  
  O papel `admin` passa em toda checagem de papel (regra central `hasRole`) e é o único que administra usuários (`403` para os demais, inclusive `manager`). Usuário nunca é apagado (`active = false`); inativo não faz login e perde o acesso na hora, porque o middleware confere `active`, `role` e `token_version` no banco a cada requisição. Desativação, rebaixamento de admin e troca/redefinição de senha incrementam `token_version`, revogando os tokens anteriores. O sistema nunca fica sem admin ativo nem permite que o admin desative ou rebaixe a si mesmo (`409`). Eventos de usuário e senha ficam em `audit_logs`.

---

## 🧪 4. Matriz de Validação das Regras

| Regra | Validação no Backend | Comportamento na Interface | Cenário de Teste |
| :--- | :--- | :--- | :--- |
| **RN-01** | Índice único parcial `orders_single_active_per_table_idx` + retorno `409`. | Indica mesa ocupada e direciona para a comanda existente. | Tentar criar segundo pedido em mesa ocupada. |
| **RN-02** | Verifica turno `open` ao criar pedido e bloqueia `PATCH /shifts/:id/close` se houver pedido ativo (`409`). | Desabilita abertura de mesa livre quando o turno está fechado. | Tentar abrir pedido sem turno ou fechar turno com mesa ocupada. |
| **RN-03** | Valida transição de status e papel em `OrderService.updateStatus`. | Exibe ações compatíveis com a etapa atual da comanda. | Forçar transição direta `open` -> `closed`. |
| **RN-04** | Bloqueia edição de quantidade se `item.status !== 'pending'` (`409`). | Oculta controles de edição/remoção após envio à cozinha. | Tentar alterar quantidade de item `sent`. |
| **RN-05** | Exige `role === 'manager'` (`403`) e `reason` preenchido (`422`). | Solicita justificativa em cancelamentos gerenciais. | Cancelar item enviado com perfil `waiter` (`403`) ou `manager` sem motivo (`422`). |
| **RN-06** | Verifica se todos os itens estão `ready` ou `canceled` antes de `ready_to_pay` (`409`). | Habilita "Pedir a conta" apenas após conclusão da cozinha. | Tentar pedir a conta com item em `preparing`. |
| **RN-07** | Soma pagamentos e impede `closed` enquanto restar saldo (`409`). | Exibe saldo devedor atualizado e trava o botão de encerrar comanda. | Registrar pagamento parcial e tentar fechar o pedido. |
| **RN-10** | `GET /shifts/:id/report` (só `manager`) agrega pagamentos líquidos (`amount - change_amount`), pedidos e itens por SQL num snapshot `REPEATABLE READ`; pedido cancelado fica fora do faturamento ([spec 010](specs/010-relatorio-do-turno.md)). | Tela "Turno" mostra o relatório (parcial com turno aberto) sem calcular nada no cliente. | Comparar `totalShift` com `SUM(amount - change_amount)` do turno, com pagamento parcial, troco e pedido cancelado. |
| **RN-11** | Cancelamento de pedido exige `manager` (`403`), motivo (`422`) e nenhum pagamento (`409`); `AuditLogService` grava `audit_logs` na mesma transação. | Botão "Cancelar pedido" (gerente) abre modal com motivo obrigatório. | Cancelar pedido sem motivo, com pagamento, e verificar rollback quando a auditoria falha. |
| **RN-12** | `orders.service_tax` persiste a taxa; `OrderService.addPayment` trava o pedido com `FOR UPDATE`, rejeita cartão/Pix > saldo (`422`) e quitado (`409`), e calcula `change_amount` em dinheiro ([spec 006](specs/006-taxa-de-servico-e-troco.md)). | Caixa persiste taxa na API, ajusta automaticamente valores acima do saldo para cartão/Pix e exibe troco para dinheiro. | Tentar cartão/Pix acima do saldo (`422`), concorrente em Pix, dinheiro com troco e desligar taxa com pago > subtotal (`409`). |
| **RN-13** | `ShiftService.open` exige o fundo; `ShiftService.addCashMovement` trava o turno com `FOR UPDATE`, valida motivo/valor e compara a sangria com `CashMovementRepository.findCashSummary` (SQL); `cash_movements_*_check` no banco ([spec 007](specs/007-movimentos-de-caixa.md)). | Turno abre com o campo "Fundo de troco"; relatório do gerente mostra o dinheiro esperado. | Abrir turno sem fundo (`422`); sangria acima da gaveta (`422`), duas sangrias simultâneas (só uma entra); caixa sem `expectedCash`. |
| **RN-17** | `AuthService.verifyApprover` confere gerente/admin ativo e a senha (`403` genérico) antes do `FOR UPDATE`; `OrderService.authorizedCancelItem` grava `canceled_by` = autorizador e a auditoria; `#assertPaidFitsWithout` recusa cancelamento que deixaria o pago acima do total (`409`) ([spec 013](specs/013-cancelamento-autorizado-no-caixa.md)). | No Caixa, o "×" do item abre o modal com motivo e autorização do gerente (caixa) ou só o motivo (gerente/admin). | Senha errada, gerente inativo e autorizador garçom (`403`, mesma mensagem, sessão mantida); cancelar item com pago acima do novo total (`409`). |
| **RN-16** | `requireRole`/`hasRole` liberam o `admin`; `/users` só `admin` (`403`); middleware recusa usuário inativo ou `token_version` diferente (`401`); trava `FOR UPDATE` nos admins ativos protege o último (`409`). | Telas "Usuários" (admin) e "Minha conta" (todos); token revogado leva ao login. | Desativar usuário e repetir a requisição com o token antigo (`401`); tentar rebaixar o último admin (`409`). |
