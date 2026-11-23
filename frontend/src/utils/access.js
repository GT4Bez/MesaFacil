// Matriz única de acesso do frontend (spec 004). O backend continua sendo a barreira real (403);
// aqui ela só decide o que cada papel vê no menu e para onde é redirecionado.
const ALL_ROLES = ['waiter', 'kitchen', 'cashier', 'manager']

// `short` é o rótulo da barra inferior no celular (spec 012).
export const SCREENS = {
  users: { path: '/admin/users', label: 'Usuários', short: 'Usuários', icon: '☺', roles: [] },
  tables: { path: '/tables', label: 'Salão e mesas', short: 'Salão', icon: '▦', roles: ['waiter', 'cashier', 'manager'] },
  kitchen: { path: '/kitchen', label: 'Cozinha (KDS)', short: 'Cozinha', icon: '♨', roles: ['kitchen', 'manager'] },
  cashier: { path: '/cashier', label: 'Caixa', short: 'Caixa', icon: '▤', roles: ['cashier', 'manager'] },
  menuAdmin: { path: '/admin/menu', label: 'Admin do cardápio', short: 'Cardápio', icon: '☰', roles: ['manager'] },
  ingredients: { path: '/admin/ingredients', label: 'Insumos', short: 'Insumos', icon: '⚖', roles: ['manager'] },
  shiftAdmin: { path: '/admin/shift', label: 'Turno e relatório', short: 'Turno', icon: '◷', roles: ['manager'] },
  audit: { path: '/admin/audit', label: 'Auditoria', short: 'Auditoria', icon: '☷', roles: ['manager'] },
  // Spec 022: configurações do sistema, só o admin (roles vazio = só admin).
  settings: { path: '/admin/settings', label: 'Configurações', short: 'Ajustes', icon: '⚒', roles: [] },
  account: { path: '/account', label: 'Minha conta', short: 'Conta', icon: '⚙', roles: ALL_ROLES },
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
