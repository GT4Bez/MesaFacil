-- RN-15 (spec 009): insumos, ficha técnica e movimentos de estoque.
CREATE TABLE ingredients (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    unit VARCHAR(2) NOT NULL,
    -- Pode ficar negativo (RN-15, regra 4): a venda não é bloqueada por falta de estoque.
    stock_quantity DECIMAL(12, 3) NOT NULL DEFAULT 0,
    min_stock DECIMAL(12, 3) NOT NULL DEFAULT 0,
    unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT ingredients_unit_check CHECK (unit IN ('un', 'kg', 'l')),
    CONSTRAINT ingredients_min_stock_check CHECK (min_stock >= 0),
    CONSTRAINT ingredients_unit_cost_check CHECK (unit_cost >= 0),
    CONSTRAINT ingredients_name_check CHECK (length(trim(name)) > 0)
);
-- Nome único sem diferenciar maiúsculas ("Batata" e "batata" são o mesmo insumo).
CREATE UNIQUE INDEX ingredients_name_unique_idx ON ingredients (lower(name));

-- Ficha técnica: quanto de cada insumo uma unidade do item do cardápio consome.
CREATE TABLE menu_item_recipes (
    menu_item_id BIGINT NOT NULL REFERENCES menu_items (id),
    ingredient_id BIGINT NOT NULL REFERENCES ingredients (id),
    quantity DECIMAL(10, 3) NOT NULL,

    PRIMARY KEY (menu_item_id, ingredient_id),
    CONSTRAINT menu_item_recipes_quantity_check CHECK (quantity > 0)
);

-- Cada movimento guarda o custo do momento (snapshot): o CMV de turnos passados não muda.
CREATE TABLE stock_movements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ingredient_id BIGINT NOT NULL REFERENCES ingredients (id),
    type VARCHAR(20) NOT NULL,
    quantity DECIMAL(12, 3) NOT NULL,
    unit_cost DECIMAL(10, 2) NOT NULL,
    order_item_id BIGINT REFERENCES order_items (id),
    shift_id BIGINT REFERENCES shifts (id),
    user_id BIGINT NOT NULL REFERENCES users (id),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT stock_movements_type_check CHECK (type IN ('sale', 'purchase', 'adjustment')),
    CONSTRAINT stock_movements_quantity_check CHECK (quantity <> 0),
    CONSTRAINT stock_movements_unit_cost_check CHECK (unit_cost >= 0),
    -- Baixa de venda sempre aponta o item do pedido; entrada e ajuste nunca.
    CONSTRAINT stock_movements_sale_item_check CHECK ((type = 'sale') = (order_item_id IS NOT NULL)),
    CONSTRAINT stock_movements_quantity_sign_check CHECK (
        (type = 'sale' AND quantity < 0) OR (type = 'purchase' AND quantity > 0) OR type = 'adjustment'
    ),
    CONSTRAINT stock_movements_adjustment_reason_check CHECK (
        type <> 'adjustment' OR length(trim(COALESCE(reason, ''))) > 0
    )
);
CREATE INDEX stock_movements_ingredient_idx ON stock_movements (ingredient_id);
CREATE INDEX stock_movements_shift_idx ON stock_movements (shift_id);
CREATE INDEX stock_movements_order_item_idx ON stock_movements (order_item_id);

-- Auditoria: mantém as ações existentes (specs 005, 007, 008 e 011) e acrescenta o ajuste de estoque.
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_action_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check
    CHECK (action IN (
        'order_item.canceled',
        'order.canceled',
        'shift.opened',
        'shift.counted',
        'shift.closed',
        'menu_item.price_changed',
        'user.created',
        'user.updated',
        'user.password_reset',
        'user.password_changed',
        'cash.withdrawal',
        'cash.reinforcement',
        'stock.adjusted'
    ));
