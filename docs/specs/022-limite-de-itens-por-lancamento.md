# 022 — Limite de itens iguais por lançamento e tela de Configurações

> Status: proposta · Regras: **RN-21 (nova)**, RN-16, RN-20 · Telas: Comanda (modal "Adicionar à comanda") e Configurações (nova, só admin)

## Contexto

O garçom lança itens pelo modal "Adicionar à comanda", com o seletor − / + (spec 012). Hoje o seletor vai até 99 e a API aceita qualquer inteiro positivo. Um toque a mais ou um número digitado errado manda para a cozinha uma quantidade absurda do mesmo item, e a baixa de estoque (RN-15) acontece no envio.

O restaurante quer um teto por lançamento para o garçom, ajustável pelo administrador sem mexer em código ou variável de ambiente. Hoje não existe lugar no banco para configurações do sistema.

## Regras

1. **RN-21 · Limite por lançamento:** o garçom (`waiter`) lança no máximo **N unidades do mesmo item por vez** (`POST /orders/:id/items`, campo `quantity`). Padrão: **N = 10**.
   - Acima de N → `422` com "Cada lançamento do garçom pode ter no máximo N unidades do mesmo item. Para mais, faça outro lançamento ou peça ao gerente."
   - **Gerente e admin não têm limite** (ex.: eventos).
   - O limite vale **só no lançamento**: editar a quantidade de um item ainda pendente (`PATCH /order-items/:id/quantity`) segue a regra atual, sem o teto.
2. **Configurações do sistema:** nova tabela `settings` (chave → valor), com a chave `max_item_quantity_per_launch` (inteiro de **1 a 99**, padrão 10).
   - `GET /settings` (qualquer usuário logado): `{ maxItemQuantityPerLaunch: 10 }`. A Comanda usa o valor para limitar o seletor.
   - `PATCH /settings` (**só admin**; outros papéis → `403`): `{ "maxItemQuantityPerLaunch": 15 }` → devolve as configurações atualizadas. Fora de 1–99 ou não inteiro → `422`; corpo sem campo conhecido → `422`.
   - A mudança vale na hora para os próximos lançamentos.
3. **Auditoria (RN-20):** cada mudança grava `setting.updated` com `details: { key, from, to }`, na mesma transação. Nova categoria `settings` ("Configurações"), visível para gerente e admin.

## Modelo de dados

Migration `020_create_settings.sql`:
- `settings (key VARCHAR(60) PRIMARY KEY, value JSONB NOT NULL, updated_by BIGINT REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`, com `CHECK (key IN ('max_item_quantity_per_launch'))`;
- linha inicial `('max_item_quantity_per_launch', '10')`;
- `audit_logs_action_check` recriado com `setting.updated`.

Se a linha não existir, o backend usa o padrão 10.

## Telas

- **Comanda (garçom):** o seletor do modal "Adicionar à comanda" para em N (o "+" desabilita) e mostra "Máximo de N por lançamento". Para gerente e admin, o seletor continua até 99.
- **Configurações (nova, `/admin/settings`, só admin):** campo "Máximo de unidades iguais por lançamento do garçom" (1 a 99), botão "Salvar" e confirmação "Configuração salva."; mostra quem alterou por último e quando. Entra no menu do admin.
- **Auditoria:** categoria "Configurações"; a entrada aparece como "Alterou configuração · Máximo por lançamento: 10 → 15".

## Critérios de aceite

- [ ] Garçom: 10 unidades → `201`; 11 → `422` com a mensagem da regra 1; gerente e admin lançam 11 → `201`.
- [ ] Editar a quantidade de item pendente acima de N continua permitido.
- [ ] Admin muda o limite para 15 e o garçom passa a lançar 15 (e não 16); outros papéis no `PATCH` → `403`; valores 0, 100, 2.5 e texto → `422`.
- [ ] `setting.updated` na auditoria com `{ key, from, to }`; o teste de cobertura das categorias continua verde.
- [ ] Comanda: seletor para em N para o garçom, com a dica; até 99 para o gerente.
- [ ] Tela Configurações: só admin (rota e menu), salva e mostra o erro da API.
- [ ] **Testes:** integração no backend, Vitest (Comanda, Configurações, auditoria) e Cypress (admin muda para 3; o garçom não passa de 3 no seletor).
- [ ] **Documentação:** `frontend/CONTRATO-API.md`, `docs/ESPECIFICACAO.md` (RN-21 na §3 e na matriz; RN-20 com a categoria nova) e `docs/ROTEIRO-DEMO.md`.

## Fora de escopo

- Outras configurações (ex.: mover o limite de sangria da variável de ambiente para a tabela) ficam para specs próprias; a tabela já nasce genérica.
- Limite por item do cardápio ou por pedido inteiro.
