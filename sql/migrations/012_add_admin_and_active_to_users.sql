-- RN-16 (spec 011): papel admin, desativação de usuários e revogação de sessão.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'waiter', 'kitchen', 'cashier', 'manager'));

-- Usuário nunca é apagado: sai com active = false.
ALTER TABLE users ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;

-- Incrementada na desativação, no rebaixamento de admin e na troca/redefinição de senha:
-- tokens emitidos com a versão anterior deixam de valer.
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;

-- E-mail sempre normalizado: a unicidade existente passa a valer sem diferenciar maiúsculas.
UPDATE users SET email = lower(trim(email)) WHERE email <> lower(trim(email));
ALTER TABLE users ADD CONSTRAINT users_email_normalized_check
    CHECK (email = lower(trim(email)));

-- Auditoria das ações de usuário (spec 005 + spec 011).
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
        'user.password_changed'
    ));
