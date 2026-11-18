-- RN-11: cancelamento do pedido registra quem cancelou e o motivo.
ALTER TABLE orders
    ADD COLUMN canceled_by BIGINT REFERENCES users (id),
    ADD COLUMN cancellation_reason TEXT,
    ADD CONSTRAINT orders_cancellation_reason_check
        CHECK (canceled_by IS NULL OR length(trim(COALESCE(cancellation_reason, ''))) > 0);
