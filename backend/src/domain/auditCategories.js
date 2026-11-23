// RN-20 (spec 017): cada ação do CHECK de audit_logs pertence a exatamente uma categoria.
// Ação nova na migration precisa entrar aqui (o teste de integração confere).
export const AUDIT_CATEGORIES = Object.freeze({
  cancellations: ['order_item.canceled', 'order.canceled'],
  orders: ['order.reopened'],
  cash: ['cash.withdrawal', 'cash.reinforcement'],
  shift: ['shift.opened', 'shift.counted', 'shift.closed'],
  catalog: ['menu_item.price_changed', 'stock.adjusted'],
  security: ['auth.login_locked', 'auth.approval_locked', 'auth.password_change_locked'],
  settings: ['setting.updated'],
  users: ['user.created', 'user.updated', 'user.password_reset', 'user.password_changed']
});

// Administração de usuários é só do admin (RN-16), inclusive na trilha.
export const ADMIN_ONLY_CATEGORIES = Object.freeze(['users']);

// Ações que o papel pode ver, opcionalmente limitadas a uma categoria.
export function visibleActions({ isAdmin, category = null }) {
  const categories = category === null ? Object.keys(AUDIT_CATEGORIES) : [category];
  return categories
    .filter((name) => isAdmin || !ADMIN_ONLY_CATEGORIES.includes(name))
    .flatMap((name) => AUDIT_CATEGORIES[name]);
}
