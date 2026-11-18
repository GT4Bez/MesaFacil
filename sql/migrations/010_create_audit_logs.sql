-- RN-11: trilha de auditoria das ações sensíveis, gravada na mesma transação da ação.
CREATE TABLE audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id),
    shift_id BIGINT REFERENCES shifts (id),
    action VARCHAR(40) NOT NULL,
    entity VARCHAR(30) NOT NULL,
    entity_id BIGINT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT audit_logs_action_check
        CHECK (action IN (
            'order_item.canceled',
            'order.canceled',
            'shift.opened',
            'shift.closed',
            'menu_item.price_changed'
        ))
);

CREATE INDEX audit_logs_shift_idx ON audit_logs (shift_id);
