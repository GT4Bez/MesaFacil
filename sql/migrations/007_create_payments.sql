CREATE TABLE payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders (id),
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT payments_amount_check
        CHECK (amount > 0),

    CONSTRAINT payments_method_check
        CHECK (payment_method IN ('cash', 'card', 'pix'))
);
