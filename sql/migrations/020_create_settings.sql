-- Spec 022 (RN-21): configurações do sistema editáveis pelo admin. Começa com o limite de
-- unidades iguais por lançamento do garçom. O id numérico é o entity_id da auditoria.
CREATE TABLE settings (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key VARCHAR(60) NOT NULL UNIQUE,
    value JSONB NOT NULL,
    updated_by BIGINT REFERENCES users (id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT settings_key_check CHECK (key IN ('max_item_quantity_per_launch'))
);

INSERT INTO settings (key, value) VALUES ('max_item_quantity_per_launch', '10');

-- Auditoria: mantém as ações existentes (até a migration 019) e acrescenta setting.updated.
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_action_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check
    CHECK (action IN (
        'order_item.canceled',
        'order.canceled',
        'order.reopened',
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
        'stock.adjusted',
        'auth.login_locked',
        'auth.approval_locked',
        'auth.password_change_locked',
        'setting.updated'
    ));
