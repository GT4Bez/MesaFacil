-- Spec 019: reabertura da conta (ready_to_pay -> in_kitchen) fica na trilha de auditoria.
-- Mantém as ações existentes (specs 005, 007, 008, 009, 011 e 015) e acrescenta order.reopened.
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
        'auth.password_change_locked'
    ));
