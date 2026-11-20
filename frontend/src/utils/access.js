// Matriz única de acesso do frontend (spec 004). O backend continua sendo a barreira real (403);
// aqui ela só decide o que cada papel vê no menu e para onde é redirecionado.
const ALL_ROLES = ['waiter', 'kitchen', 'cashier', 'manager']

export const SCREENS = {
  users: { path: '/admin/users', label: 'Usuários', icon: '☺', roles: [] },
  tables: { path: '/tables', label: 'Salão e mesas', icon: '▦', roles: ['waiter', 'cashier', 'manager'] },
  kitchen: { path: '/kitchen', label: 'Cozinha (KDS)', icon: '♨', roles: ['kitchen', 'manager'] },
  cashier: { path: '/cashier', label: 'Caixa', icon: '▤', roles: ['cashier', 'manager'] },
  menuAdmin: { path: '/admin/menu', label: 'Admin do cardápio', icon: '☰', roles: ['manager'] },
  shiftAdmin: { path: '/admin/shift', label: 'Turno e relatório', icon: '◷', roles: ['manager'] },
  account: { path: '/account', label: 'Minha conta', icon: '⚙', roles: ALL_ROLES },
}

// RN-16: o admin (superadmin) passa em toda checagem de papel, como no backend.
export const hasRole = (user, ...roles) => user?.role === 'admin' || roles.includes(user?.role)

const HOME_BY_ROLE = {
  admin: SCREENS.users.path,
  waiter: SCREENS.tables.path,
  kitchen: SCREENS.kitchen.path,
  cashier: SCREENS.cashier.path,
  manager: SCREENS.tables.path,
}

export const homeFor = (role) => HOME_BY_ROLE[role] ?? SCREENS.tables.path

export const menuFor = (role) => Object.values(SCREENS).filter((screen) => hasRole({ role }, ...screen.roles))
