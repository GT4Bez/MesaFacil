-- RN-19 (spec 015): limite de tentativas de senha no login, na autorização do gerente e na troca de senha.
CREATE TABLE auth_throttles (
    scope VARCHAR(20) NOT NULL,
    -- E-mail normalizado (login) ou id do usuário logado (approval e password_change).
    key TEXT NOT NULL,
    failures INTEGER NOT NULL DEFAULT 0,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locked_until TIMESTAMPTZ,

    PRIMARY KEY (scope, key),
    CONSTRAINT auth_throttles_scope_check CHECK (scope IN ('login', 'approval', 'password_change')),
    CONSTRAINT auth_throttles_failures_check CHECK (failures >= 0)
);

-- Auditoria: mantém as ações existentes (specs 005, 007, 008, 009 e 011) e acrescenta os bloqueios.
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
        'stock.adjusted',
        'auth.login_locked',
        'auth.approval_locked',
        'auth.password_change_locked'
    ));
