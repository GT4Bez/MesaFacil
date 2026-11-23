// Spec 021: rótulos iguais aos da tela (frontend/src/utils/format.js), usados nas mensagens de erro.
export const ROLE_LABELS = Object.freeze({
  admin: 'Administrador',
  waiter: 'Garçom',
  kitchen: 'Cozinha',
  cashier: 'Caixa',
  manager: 'Gerente'
});

export const ORDER_STATUS_LABELS = Object.freeze({
  open: 'Aberto',
  in_kitchen: 'Na cozinha',
  ready_to_pay: 'Aguardando pagamento',
  closed: 'Encerrado',
  canceled: 'Cancelado'
});

export const ITEM_STATUS_LABELS = Object.freeze({
  pending: 'Pendente',
  sent: 'Enviado',
  preparing: 'Em preparo',
  ready: 'Pronto',
  canceled: 'Cancelado'
});

export const PAYMENT_METHOD_LABELS = Object.freeze({ cash: 'Dinheiro', card: 'Cartão', pix: 'Pix' });

// Espaço comum em vez do não separável do Intl, para a mensagem ser igual em qualquer cliente.
export const formatBRL = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value).replace(/\s/g, ' ');

// "A", "A ou B", "A, B ou C".
export function orList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ou ${items.at(-1)}`;
}

// Quem pode fazer a ação (o admin passa em tudo e não é listado) e com que papel a pessoa entrou.
export function permissionMessage(allowedRoles, user, action = 'fazer isto') {
  const roles = allowedRoles.filter((role) => role !== 'admin').map((role) => ROLE_LABELS[role] ?? role);
  const who = roles.length ? `Só ${orList(roles)} ${roles.length > 1 ? 'podem' : 'pode'}` : 'Só o Administrador pode';
  const current = user?.role ? ` Você entrou como ${ROLE_LABELS[user.role] ?? user.role}.` : '';
  return `${who} ${action}.${current}`;
}

export const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
