-- RN-14 (spec 008): fechamento do turno com conferência cega.
-- O caixa declara o que contou; o esperado de cada forma é congelado no momento da contagem.
CREATE TABLE shift_counts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shift_id BIGINT NOT NULL REFERENCES shifts (id),
    payment_method VARCHAR(10) NOT NULL,
    declared DECIMAL(10, 2) NOT NULL,
    -- O esperado soma valores que cabem cada um em DECIMAL(10, 2) (fundo, pagamentos, reforços),
    -- então precisa de mais dígitos que eles.
    expected DECIMAL(14, 2) NOT NULL,
    difference DECIMAL(15, 2) GENERATED ALWAYS AS (declared - expected) STORED,
    counted_by BIGINT NOT NULL REFERENCES users (id),
    counted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note TEXT,

    CONSTRAINT shift_counts_method_check CHECK (payment_method IN ('cash', 'card', 'pix')),
    CONSTRAINT shift_counts_declared_check CHECK (declared >= 0),
    -- Uma linha por forma: recontar substitui a contagem anterior.
    CONSTRAINT shift_counts_unique UNIQUE (shift_id, payment_method)
);

-- Quem encerrou e o motivo das diferenças (obrigatório quando alguma diferença ≠ 0, regra no serviço).
ALTER TABLE shifts
    ADD COLUMN closed_by BIGINT REFERENCES users (id),
    ADD COLUMN closing_note TEXT;

-- Auditoria: mantém as ações existentes (specs 005, 007 e 011) e acrescenta a contagem.
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
        'cash.reinforcement'
    ));
