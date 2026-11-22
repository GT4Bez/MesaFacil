-- RN-13 (spec 007): movimentos de dinheiro da gaveta no turno — fundo de troco, sangria e reforço.
CREATE TABLE cash_movements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shift_id BIGINT NOT NULL REFERENCES shifts (id),
    user_id BIGINT NOT NULL REFERENCES users (id),
    type VARCHAR(20) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT cash_movements_type_check
        CHECK (type IN ('opening_float', 'withdrawal', 'reinforcement')),
    -- Só o fundo pode ser 0; sangria e reforço são sempre positivos.
    CONSTRAINT cash_movements_amount_check
        CHECK (amount > 0 OR (type = 'opening_float' AND amount = 0)),
    -- Sangria e reforço exigem motivo.
    CONSTRAINT cash_movements_reason_check
        CHECK (type = 'opening_float' OR length(trim(COALESCE(reason, ''))) > 0)
);

-- Um único fundo por turno.
CREATE UNIQUE INDEX cash_movements_single_float_idx ON cash_movements (shift_id) WHERE type = 'opening_float';
CREATE INDEX cash_movements_shift_idx ON cash_movements (shift_id);

-- Auditoria: mantém as ações existentes (specs 005 e 011) e acrescenta as do caixa.
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_action_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check
    CHECK (action IN (
        'order_item.canceled',
        'order.canceled',
        'shift.opened',
        'shift.closed',
        'menu_item.price_changed',
        'user.created',
        'user.updated',
        'user.password_reset',
        'user.password_changed',
        'cash.withdrawal',
        'cash.reinforcement'
    ));
