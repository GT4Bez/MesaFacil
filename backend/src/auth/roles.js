// RN-16: papéis do sistema e regra central de autorização.
export const ROLES = ['admin', 'waiter', 'kitchen', 'cashier', 'manager'];

// O admin (superadmin) passa em toda checagem de papel. Use sempre este helper em vez de
// comparar `user.role` diretamente, para não deixar o admin de fora sem perceber.
export const hasRole = (user, ...roles) =>
  user?.role === 'admin' || roles.includes(user?.role);
