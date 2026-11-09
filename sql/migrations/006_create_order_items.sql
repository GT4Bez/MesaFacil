CREATE TABLE order_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders (id),
    menu_item_id BIGINT NOT NULL REFERENCES menu_items (id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    canceled_by BIGINT REFERENCES users (id),
    cancellation_reason TEXT,

    CONSTRAINT order_items_quantity_check
        CHECK (quantity > 0),

    -- RN-09: preco congelado no lancamento.
    CONSTRAINT order_items_unit_price_check
        CHECK (unit_price >= 0),

    CONSTRAINT order_items_status_check
        CHECK (status IN ('pending', 'sent', 'preparing', 'ready', 'canceled')),

    -- RN-05: cancelamento registrado por alguem sempre tem motivo.
    CONSTRAINT order_items_cancellation_reason_check
        CHECK (canceled_by IS NULL OR length(trim(COALESCE(cancellation_reason, ''))) > 0)
);
