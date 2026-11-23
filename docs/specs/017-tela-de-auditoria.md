# 017 — Tela de auditoria

> Status: proposta · Regras: RN-11, RN-16, **RN-20 (nova)** · Tela: Auditoria (nova)

## Contexto

Desde a spec 005, as ações sensíveis ficam gravadas em `audit_logs` (RN-11), e as specs seguintes acrescentaram outras:
- cancelamentos de item e de pedido;
- abertura, conferência e fechamento de turno;
- sangrias e reforços, inclusive os autorizados;
- mudança de preço e ajuste de estoque;
- administração de usuários;
- bloqueios por excesso de tentativas de senha.

Hoje nenhuma tela mostra esses registros. Para saber quem cancelou um item, quem autorizou uma sangria ou se um caixa bloqueou a autorização tentando a senha do gerente, é preciso consultar o banco. A spec 015 deixou essa tela de fora ("ficam em `audit_logs`"); esta spec a cria, só para leitura.

## Regras (RN-20)

1. **Rota e acesso:** `GET /audit-logs` e `GET /audit-logs/actors` (gerente; o admin passa pelo `hasRole`, RN-16). Outros papéis → `403`; sem token → `401`.
2. **Visibilidade por papel:** as ações `user.*` (administração de usuários, spec 011) só aparecem para o `admin`, coerente com a RN-16 (o `manager` já recebe `403` em `/users`).
   - Para o `manager`, elas são excluídas no próprio SQL (lista e `actors`), para que a paginação não traga páginas vazias.
   - `manager` com `category=users` → `403`.
3. **Somente leitura:** não há rota para alterar ou apagar registros. A trilha continua sendo gravada só pelo `AuditLogService`, na transação da ação.
4. **Ordem e paginação:** do mais recente para o mais antigo, por `id` decrescente, com cursor igual ao da spec 016:
   - `limit` (padrão 50, de 1 a 100) e `before` (id do último registro recebido);
   - a resposta traz `nextBefore`, `null` quando não há mais páginas;
   - valores inválidos → `422`.
5. **Filtros opcionais, combináveis:**

   | Parâmetro | Valor | Ações |
   | :-- | :-- | :-- |
   | `category` | `cancellations` | `order_item.canceled`, `order.canceled` |
   | | `cash` | `cash.withdrawal`, `cash.reinforcement` |
   | | `shift` | `shift.opened`, `shift.counted`, `shift.closed` |
   | | `catalog` | `menu_item.price_changed`, `stock.adjusted` |
   | | `security` | `auth.login_locked`, `auth.approval_locked`, `auth.password_change_locked` |
   | | `users` | `user.created`, `user.updated`, `user.password_reset`, `user.password_changed` (só admin) |
   | `userId` | id de quem fez a ação (`audit_logs.user_id`) | — |
   | `shiftId` | id do turno (`audit_logs.shift_id`) | — |
   | `from`, `to` | data e hora ISO 8601 **com fuso** (`2026-11-23T00:00:00-03:00`); `from` inclusivo, `to` exclusivo | — |

   - Categoria desconhecida, id não numérico, data sem fuso ou inválida, ou `from >= to` → `422`.
   - O mapa categoria → ações fica numa constante do backend, junto da lista do `CHECK` (uma ação nova precisa entrar em uma categoria; um teste garante isso).
   - O frontend converte o dia escolhido (horário local do navegador) em `from`/`to`; o backend não assume fuso.
6. **Cada registro traz:**
   - `id`, `action`, `createdAt`, `shiftId` (`string | null`);
   - `user`: `{ id, name, role }` de `audit_logs.user_id`. Nas ações `auth.*_locked` (spec 015) é o dono da chave bloqueada (o caixa, no `approval`; o dono do e-mail, no `login`), não alguém que agiu;
   - `entity`, `entityId` e `details` exatamente como gravados;
   - `target`: um resumo do alvo, resolvido por `LEFT JOIN` na mesma consulta (o registro nunca some se o alvo mudou):

     | `entity` | `target` |
     | :-- | :-- |
     | `order` | `{ orderId, tableNumber }` |
     | `order_item` | `{ orderId, tableNumber, menuItem }` |
     | `menu_item` | `{ name }` (nome atual) |
     | `ingredient` | `{ name, unit }` |
     | `user` | `{ name, role }` |
     | `shift`, `cash_movement` | `null` (o turno já vem em `shiftId` e o valor em `details`) |
   - `details.approvedBy` (specs 013 e 014) já traz `{ id, name }`; não há join extra.
7. **Quem aparece em `actors`:** `GET /audit-logs/actors` lista os usuários (`id`, `name`, `role`, `active`) com pelo menos um registro visível ao papel de quem consulta, em ordem de nome, para alimentar o filtro. Não usa `/users`, que é só do admin.

## Modelo de dados

`018_add_audit_logs_indexes.sql` (próximo número livre):

```sql
-- RN-20: consulta da trilha por pessoa e por ação, sempre do mais recente para o mais antigo.
CREATE INDEX audit_logs_user_idx ON audit_logs (user_id, id DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, id DESC);
```

Sem mudança de colunas nem do `CHECK`. O índice `audit_logs_shift_idx` (migration 010) atende o filtro por turno.

## Contrato da API

`GET /audit-logs?category=cash&limit=2`

```json
{
  "entries": [
    { "id": "88", "action": "cash.withdrawal", "createdAt": "...", "shiftId": "7",
      "user": { "id": "4", "name": "Caixa", "role": "cashier" },
      "entity": "cash_movement", "entityId": "31",
      "details": { "amount": 250, "reason": "Pagamento do gás", "approvedBy": { "id": "2", "name": "Gerente" } },
      "target": null },
    { "id": "85", "action": "cash.reinforcement", "createdAt": "...", "shiftId": "7",
      "user": { "id": "4", "name": "Caixa", "role": "cashier" },
      "entity": "cash_movement", "entityId": "30",
      "details": { "amount": 300, "reason": "Troco" },
      "target": null }
  ],
  "nextBefore": "85"
}
```

`GET /audit-logs/actors`

```json
{ "actors": [ { "id": "4", "name": "Caixa", "role": "cashier", "active": true }, { "id": "2", "name": "Gerente", "role": "manager", "active": true } ] }
```

Erros pelo envelope de sempre (`AppError`): `401`, `403` (`FORBIDDEN`), `422` (`VALIDATION_ERROR`).

## Telas

- **Nova tela "Auditoria"** em `/admin/audit` (`SCREENS.audit`, papéis `['manager']`, ícone e rótulo curto "Auditoria"). No celular, entra no menu "Mais telas" (spec 012).
- **Filtros** no topo:
  - categoria em botões de 44 px com `aria-pressed` ("Todas", "Cancelamentos", "Caixa", "Turno", "Cardápio e estoque", "Segurança" e, só para o admin, "Usuários");
  - "Quem fez" (`select` com os `actors`, inativos marcados como "(inativo)");
  - período "De" e "Até" (`input type="date"`; o "Até" inclui o dia inteiro).
  - Trocar um filtro recarrega a lista do início.
- **Lista** com data e hora, quem fez (nome e papel), a ação em texto e um resumo. Exemplos:
  - "Cancelou item · Pedido 42 · Mesa 5 · Picanha na chapa · Motivo: cliente desistiu · autorizado por Gerente";
  - "Sangria R$ 250,00 · Pagamento do gás · autorizada por Gerente";
  - "Preço de Picanha na chapa: R$ 89,90 → R$ 94,90";
  - "Ajuste de estoque de Picanha: 4,85 kg → 4,50 kg (−0,35) · Motivo: quebra";
  - "Autorização bloqueada por excesso de tentativas · e-mail tentado: gerente@mesafacil.com";
  - "Login bloqueado por excesso de tentativas";
  - "Fechou o turno 7".
  - O texto de cada ação fica num mapa do frontend (`utils/auditLabels.js`). Ação desconhecida mostra o código cru, sem quebrar a tela.
- "Carregar mais" quando `nextBefore` não é nulo; lista vazia mostra "Nenhum registro para esses filtros."
- No celular, cada registro vira um cartão (mesmo padrão do histórico do insumo, spec 016).

## Critérios de aceite

- [ ] **Acesso:** sem token → `401`; garçom, caixa e cozinha → `403`; `manager` e `admin` → `200`.
- [ ] **Visibilidade:**
  - o `manager` não recebe nenhuma ação `user.*`, nem na lista, nem em `actors`;
  - `manager` com `category=users` → `403`;
  - o `admin` recebe tudo.
- [ ] **Ordem e paginação:** `limit=2` com `before` percorre todos os registros sem repetir nem pular (mesmo com uma ação nova gravada entre as páginas), e a última página tem `nextBefore: null`.
- [ ] **Filtros:** `category`, `userId`, `shiftId` e `from`/`to` filtram corretamente, inclusive combinados; `to` é exclusivo.
- [ ] **Validação:** `limit`, `before`, `category`, `userId`, `shiftId` inválidos, data sem fuso e `from >= to` → `422`.
- [ ] **Alvo:** o cancelamento autorizado traz pedido, mesa, item e `details.approvedBy`; a mudança de preço traz o nome do item; o ajuste traz nome e unidade do insumo; registro de turno e de caixa traz `target: null`.
- [ ] **Categorias:** um teste confirma que toda ação do `CHECK` de `audit_logs` pertence a exatamente uma categoria.
- [ ] **Testes:**
  - integração no backend (acesso, visibilidade, filtros, paginação, `actors`);
  - Vitest (a tela carrega, o filtro de categoria troca a lista, "Carregar mais" acrescenta, o manager não vê o filtro "Usuários" e uma ação desconhecida não quebra a tela);
  - Cypress (depois do cenário RN-17, a auditoria do gerente mostra o cancelamento autorizado por ele).
- [ ] **Documentação:**
  - `docs/ESPECIFICACAO.md`: RN-20 na §3.3 e na matriz (§4);
  - `frontend/CONTRATO-API.md`;
  - a spec 005 e a spec 015 apontam para esta spec.

## Fora de escopo

- Exportar para CSV ou PDF.
- Busca por texto livre no motivo ou nos detalhes.
- Mostrar a auditoria dentro de outras telas (por exemplo, no relatório do turno ou no histórico do insumo).
- Proteger `audit_logs` contra `UPDATE`/`DELETE` no banco (trigger ou permissões); a aplicação já não tem rota para isso.
- Registrar logins bem-sucedidos e consultas (a trilha continua só com as ações sensíveis).
- Retenção ou arquivamento de registros antigos.
