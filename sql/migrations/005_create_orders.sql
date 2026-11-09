CREATE TABLE orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_id BIGINT NOT NULL REFERENCES tables (id),
    shift_id BIGINT NOT NULL REFERENCES shifts (id),
    user_id BIGINT NOT NULL REFERENCES users (id),
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT orders_status_check
        CHECK (status IN ('open', 'in_kitchen', 'ready_to_pay', 'closed', 'canceled'))
);

-- RN-01: uma mesa nao pode ter dois pedidos ativos ao mesmo tempo.
CREATE UNIQUE INDEX orders_single_active_per_table_idx
    ON orders (table_id)
    WHERE status IN ('open', 'in_kitchen', 'ready_to_pay');
