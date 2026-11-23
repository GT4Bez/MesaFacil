# 009 — Insumos e ficha técnica

> Status: aprovada (revisada antes da implementação) · Regras: RN-10, **RN-15 (nova)** · Telas: Insumos, ficha técnica no Admin do cardápio e CMV no Turno

## Contexto

O restaurante não sabe quanto custa cada prato nem quanto ingrediente consumiu no turno. A ficha técnica liga cada item do cardápio aos insumos que ele consome, permitindo baixa automática de estoque e cálculo do CMV (custo da mercadoria vendida) no relatório do turno.

## Regras (RN-15)

1. **Insumo**: `name`, `unit` (`un`, `kg`, `l`), `min_stock` ≥ 0, `unit_cost` ≥ 0, `active`. Quantidades com 3 casas decimais. Só `manager` (e `admin`) vê, cadastra e altera; a unidade não muda depois do cadastro.
2. **Ficha técnica**: lista de `{ ingredientId, quantity > 0 }` por item do cardápio, sem insumo repetido; substituída inteira a cada gravação. Item sem ficha é vendido normalmente, sem baixa. Não se inclui insumo inativo novo (`409`), mas um insumo desativado que **já estava** na ficha pode continuar nela (a ficha segue editável e continua dando baixa); a tela o destaca para ser trocado.
3. **Baixa automática**: no envio à cozinha (`pending → sent`), na mesma transação, cada item enviado gera um movimento `sale` por insumo da ficha: `−(quantidade do item × quantidade da ficha)`. Os insumos são travados em ordem de id (`FOR UPDATE`), para que envios simultâneos não entrem em deadlock.
4. Estoque **pode ficar negativo**; insumos com `stock_quantity < min_stock` aparecem como alerta.
5. Cancelar item já enviado **não** devolve estoque (é perda); item `pending` cancelado nunca foi baixado.
6. **Entrada** (`purchase`): quantidade > 0 e custo unitário; atualiza `unit_cost` para o último custo.
7. **Ajuste** (`adjustment`): o gerente informa a quantidade contada e o motivo; o sistema grava a diferença e audita `stock.adjusted` (`details`: `from`, `to`, `difference`, `reason`). Contagem igual ao estoque → `422`.
8. Cada movimento guarda o `unit_cost` do momento (snapshot), para o CMV de turnos passados não mudar.
9. Custo do item do cardápio = Σ (quantidade da ficha × `unit_cost` atual), exibido no admin com a margem.

## Modelo de dados

Uma migration só, `015_create_ingredients_and_stock.sql` (a `013` é dos movimentos de caixa e a `014` é da conferência cega, spec 008):

- `ingredients`: `name` único sem diferenciar maiúsculas (`ingredients_name_unique_idx` em `lower(name)`), `unit` (`un`, `kg`, `l`), `stock_quantity DECIMAL(12, 3)` (pode ficar negativo), `min_stock ≥ 0`, `unit_cost ≥ 0`, `active`.
- `menu_item_recipes (menu_item_id, ingredient_id)` como chave primária, com `quantity > 0` (3 casas).
- `stock_movements`: `type` (`sale`, `purchase`, `adjustment`), `quantity ≠ 0`, `unit_cost` do momento, `order_item_id` (obrigatório só na venda), `shift_id`, `user_id` e `reason` (obrigatório no ajuste). O sinal é checado no banco: venda < 0, entrada > 0.
- `audit_logs_action_check` ganha `stock.adjusted` e mantém todas as ações anteriores (specs 005, 007, 008 e 011, inclusive `shift.counted`).

Seed `010_seed_ingredients.sql`: 10 insumos (o leite condensado já começa abaixo do mínimo) e fichas para 6 dos 8 itens do cardápio. Refrigerante e Petit Gâteau ficam sem ficha, para mostrar a cobertura do CMV.

## Contrato da API (gerente; o admin passa pelo `hasRole`)

- `GET /ingredients` → `[{ id, name, unit, stockQuantity, minStock, unitCost, active, belowMin }]`, em ordem alfabética.
- `POST /ingredients` — `{ name, unit, minStock?, unitCost?, active? }` → `201`. Nome repetido → `409`.
- `PATCH /ingredients/:id` — qualquer subconjunto de `{ name, minStock, unitCost, active }`. A unidade não muda depois do cadastro (`422`); o estoque só muda por movimento.
- `POST /ingredients/:id/purchases` — `{ quantity > 0, unitCost ≥ 0 }` → `201` com o insumo atualizado (o custo passa a ser o da compra).
- `POST /ingredients/:id/adjustments` — `{ countedQuantity ≥ 0, reason }` → `201`. Sem diferença → `422`.
- `GET /menu-items/:id/recipe` → `{ menuItemId, price, items: [{ ingredientId, name, unit, quantity, unitCost, cost, active }], cost, margin, marginPercent }`.
- `PUT /menu-items/:id/recipe` — `{ items: [{ ingredientId, quantity }] }`. Lista vazia remove a ficha. A resposta tem o mesmo formato do `GET`.
- `GET /shifts/:id/report` ganha `cmv: { revenue, cost, grossMargin, marginPercent, losses, soldItems, itemsWithRecipe }`.

Erros: `422` validação (inclusive insumo repetido na ficha e valores além do limite das colunas, como uma baixa gigante no envio), `404` inexistente, `403` papel, `409` nome repetido ou insumo inativo novo na ficha.

## CMV no relatório do turno (decisão da revisão)

- `cost`: soma das baixas (`−quantity × unit_cost` gravado) dos itens **vendidos**, isto é, não cancelados e de pedidos `closed` do turno. É a mesma base de `byMenuItem`.
- `revenue`: soma de `quantity × unit_price` desses itens, sem taxa de serviço. `grossMargin = revenue − cost`; `marginPercent` (uma casa) é `null` sem vendas.
- `losses`: custo das baixas de itens enviados e depois cancelados (item ou pedido). É perda, não venda (regra 5).
- `soldItems` / `itemsWithRecipe`: unidades vendidas e quantas delas tiveram baixa (cobertura das fichas).

## Telas

- **Insumos** (nova tela, gerente/admin): lista com estoque, mínimo (alerta), custo e situação; novo/editar, entrada e ajuste em modal (spec 012).
- **Admin do cardápio**: botão "Ficha técnica" no item, que abre um modal com as linhas de insumo e quantidade, o custo e a margem.
- **Turno**: bloco "CMV" no relatório (custo, margem, perdas e cobertura).

## Critérios de aceite

- [ ] Enviar à cozinha 2× um item cuja ficha usa 0,150 kg baixa 0,300 kg, na mesma transação do envio.
- [ ] Estoque negativo é permitido e marcado com `belowMin`.
- [ ] Ajuste grava a diferença e a auditoria; entrada atualiza o custo.
- [ ] Alterar o custo depois não muda o custo gravado nos movimentos antigos.
- [ ] O CMV do relatório considera só os itens vendidos de pedidos encerrados; os enviados e cancelados entram como perda.
- [ ] `docs/ESPECIFICACAO.md`: RN-15 na seção 3.3 "Evoluções da squad" e linha na matriz de validação (§4); `frontend/CONTRATO-API.md`, `docs/ROTEIRO-DEMO.md` e `scripts/demo-regras.sh` atualizados.

## Fora de escopo

- Múltiplos locais de estoque, ordens de produção, fornecedores, conversão de unidades, custo médio, inventário completo.
- Histórico de movimentos por insumo: tratado na [spec 016](016-historico-de-insumo.md).
