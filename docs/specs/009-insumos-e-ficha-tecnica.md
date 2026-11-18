# 009 — Insumos e ficha técnica

> Status: proposta · Regras: **RN-15 (nova)** · Tela: Insumos + ficha técnica no Admin do cardápio

## Contexto

O restaurante não sabe quanto custa cada prato nem quanto ingrediente consumiu no turno. A ficha técnica liga cada item do cardápio aos insumos que ele consome, permitindo baixa automática de estoque e cálculo do CMV (custo da mercadoria vendida) no relatório do turno.

## Regras (RN-15)

1. **Insumo**: `name`, `unit` (`un`, `kg`, `l`), `min_stock` ≥ 0, `unit_cost` ≥ 0, `active`. Quantidades com 3 casas decimais. Só `manager` cadastra e altera.
2. **Ficha técnica**: lista de `{ ingredientId, quantity > 0 }` por item do cardápio, sem insumo repetido; substituída inteira a cada gravação. Item sem ficha é vendido normalmente, sem baixa.
3. **Baixa automática**: no envio à cozinha (`pending → sent`), na mesma transação, cada item enviado gera um movimento `sale` por insumo da ficha: `−(quantidade do item × quantidade da ficha)`.
4. Estoque **pode ficar negativo**; insumos com `stock_quantity < min_stock` aparecem como alerta.
5. Cancelar item já enviado **não** devolve estoque (é perda); item `pending` cancelado nunca foi baixado.
6. **Entrada** (`purchase`): quantidade > 0 e custo unitário; atualiza `unit_cost` para o último custo.
7. **Ajuste** (`adjustment`): o gerente informa a quantidade contada e o motivo; o sistema grava a diferença e audita `stock.adjusted`.
8. Cada movimento guarda o `unit_cost` do momento (snapshot), para o CMV de turnos passados não mudar.
9. Custo do item do cardápio = Σ (quantidade da ficha × `unit_cost` atual), exibido no admin com a margem.

## Modelo de dados

`014_create_ingredients.sql`, `015_create_menu_item_recipes.sql`, `016_create_stock_movements.sql`:

```sql
CREATE TABLE ingredients (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  unit VARCHAR(2) NOT NULL CHECK (unit IN ('un', 'kg', 'l')),
  stock_quantity DECIMAL(10, 3) NOT NULL DEFAULT 0,
  min_stock DECIMAL(10, 3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE menu_item_recipes (
  menu_item_id BIGINT NOT NULL REFERENCES menu_items (id),
  ingredient_id BIGINT NOT NULL REFERENCES ingredients (id),
  quantity DECIMAL(10, 3) NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (menu_item_id, ingredient_id)
);

CREATE TABLE stock_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients (id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('sale', 'purchase', 'adjustment')),
  quantity DECIMAL(10, 3) NOT NULL CHECK (quantity <> 0),
  unit_cost DECIMAL(10, 2) NOT NULL,
  order_item_id BIGINT REFERENCES order_items (id),
  shift_id BIGINT REFERENCES shifts (id),
  user_id BIGINT NOT NULL REFERENCES users (id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT stock_movements_sale_item_check CHECK ((type = 'sale') = (order_item_id IS NOT NULL))
);
```

Seed `008_seed_ingredients.sql`: ~10 insumos e ficha para 6 dos 8 itens do cardápio (2 ficam sem ficha, para demonstrar a cobertura do CMV).

## Contrato da API (todas `manager`)

- `GET /ingredients` → `[{ id, name, unit, stockQuantity, minStock, unitCost, active, belowMin }]`
- `POST /ingredients` · `PATCH /ingredients/:id`
- `POST /ingredients/:id/purchases` — `{ quantity, unitCost }`
- `POST /ingredients/:id/adjustments` — `{ countedQuantity, reason }`
- `GET /menu-items/:id/recipe` → `{ items: [{ ingredientId, name, unit, quantity, cost }], cost, price, margin }`
- `PUT /menu-items/:id/recipe` — `{ items: [{ ingredientId, quantity }] }`

Erros: `422` validação, `404` inexistente, `403` papel, `409` insumo inativo na ficha.

## Telas

**Insumos**: lista com estoque, mínimo (alerta em vermelho), custo; ações de entrada e ajuste. **Admin do cardápio**: aba "Ficha técnica" no item, com custo e margem.

## Critérios de aceite

- [ ] Enviar à cozinha 2× um item cuja ficha usa 0,150 kg baixa 0,300 kg, na mesma transação do envio.
- [ ] Estoque negativo é permitido e marcado com `belowMin`.
- [ ] Ajuste grava a diferença e a auditoria; entrada atualiza o custo.
- [ ] Alterar o custo depois não muda o custo gravado nos movimentos antigos.
- [ ] `docs/ESPECIFICACAO.md`: RN-15 na nova seção 3.3 "Evoluções da squad" e linha na matriz de validação (§4).

## Fora de escopo

- Múltiplos locais de estoque, ordens de produção, fornecedores, conversão de unidades, custo médio, inventário completo.
