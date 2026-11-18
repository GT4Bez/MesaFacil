// Matriz única de acesso do frontend (spec 004). O backend continua sendo a barreira real (403);
// aqui ela só decide o que cada papel vê no menu e para onde é redirecionado.
export const SCREENS = {
  tables: { path: '/tables', label: 'Salão e mesas', icon: '▦', roles: ['waiter', 'cashier', 'manager'] },
  kitchen: { path: '/kitchen', label: 'Cozinha (KDS)', icon: '♨', roles: ['kitchen', 'manager'] },
  cashier: { path: '/cashier', label: 'Caixa', icon: '▤', roles: ['cashier', 'manager'] },
  menuAdmin: { path: '/admin/menu', label: 'Admin do cardápio', icon: '☰', roles: ['manager'] },
}

const HOME_BY_ROLE = {
  waiter: SCREENS.tables.path,
  kitchen: SCREENS.kitchen.path,
  cashier: SCREENS.cashier.path,
  manager: SCREENS.tables.path,
}

export const homeFor = (role) => HOME_BY_ROLE[role] ?? SCREENS.tables.path

export const menuFor = (role) => Object.values(SCREENS).filter((screen) => screen.roles.includes(role))
