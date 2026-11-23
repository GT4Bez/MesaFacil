import { formatMoney, formatQuantity, PAYMENT_METHOD_LABELS, ROLE_LABELS } from './format'

// RN-20 (spec 017): categorias da tela de auditoria, na ordem dos botões. `adminOnly` some para o gerente.
export const AUDIT_CATEGORIES = [
  { value: null, label: 'Todas' },
  { value: 'cancellations', label: 'Cancelamentos' },
  { value: 'orders', label: 'Pedidos' },
  { value: 'cash', label: 'Caixa' },
  { value: 'shift', label: 'Turno' },
  { value: 'catalog', label: 'Cardápio e estoque' },
  { value: 'security', label: 'Segurança' },
  { value: 'users', label: 'Usuários', adminOnly: true },
]

const USER_FIELD_LABELS = { name: 'nome', email: 'e-mail', role: 'papel', active: 'ativo' }

const join = (...parts) => parts.filter(Boolean).join(' · ')
const reason = (text) => text && `Motivo: ${text}`
const orderLabel = (target) =>
  target ? join(`Pedido ${target.orderId}`, target.tableNumber != null && `Mesa ${target.tableNumber}`) : null
const userValue = (field, value) => {
  if (field === 'role') return ROLE_LABELS[value] ?? value
  if (field === 'active') return value ? 'sim' : 'não'
  return value
}
const signed = (value, unit) => `${value > 0 ? '+' : '−'}${formatQuantity(Math.abs(value), unit)}`

// Cada ação vira { title, summary }. `entry` é um registro de GET /audit-logs.
const DESCRIBERS = {
  'order_item.canceled': ({ details, target }) => ({
    title: 'Cancelou item',
    summary: join(
      orderLabel(target),
      target?.menuItem,
      reason(details.reason),
      details.approvedBy && `autorizado por ${details.approvedBy.name}`,
    ),
  }),
  'order.canceled': ({ details, target }) => ({
    title: 'Cancelou pedido',
    summary: join(orderLabel(target), reason(details.reason)),
  }),
  // Spec 019: conta pedida que voltou ao atendimento.
  'order.reopened': ({ details, target }) => ({
    title: 'Reabriu a conta',
    summary: join(orderLabel(target), reason(details.reason), details.paidAmount > 0 && `já pago ${formatMoney(details.paidAmount)}`),
  }),
  'shift.opened': ({ details, shiftId }) => ({
    title: `Abriu o turno ${shiftId ?? ''}`.trim(),
    summary: details.openingFloat != null ? `Fundo de troco ${formatMoney(details.openingFloat)}` : '',
  }),
  'shift.counted': ({ details, shiftId }) => ({
    title: `Contou o caixa do turno ${shiftId ?? ''}`.trim(),
    summary: join(
      details.declared &&
        // Ordem fixa: o JSONB não preserva a ordem das chaves.
        Object.keys(PAYMENT_METHOD_LABELS)
          .filter((method) => details.declared[method] != null)
          .map((method) => `${PAYMENT_METHOD_LABELS[method]} ${formatMoney(details.declared[method])}`)
          .join(', '),
      details.note && `Obs.: ${details.note}`,
    ),
  }),
  'shift.closed': ({ details, shiftId }) => ({
    title: `Fechou o turno ${shiftId ?? ''}`.trim(),
    summary: reason(details.reason) ?? '',
  }),
  'cash.withdrawal': ({ details }) => ({
    title: 'Sangria',
    summary: join(
      formatMoney(details.amount),
      details.reason,
      details.approvedBy && `autorizada por ${details.approvedBy.name}`,
    ),
  }),
  'cash.reinforcement': ({ details }) => ({
    title: 'Reforço',
    summary: join(formatMoney(details.amount), details.reason),
  }),
  'menu_item.price_changed': ({ details, target }) => ({
    title: 'Mudou o preço',
    summary: `${target?.name ?? 'Item'}: ${formatMoney(details.from)} → ${formatMoney(details.to)}`,
  }),
  'stock.adjusted': ({ details, target }) => {
    const unit = target?.unit
    return {
      title: 'Ajustou o estoque',
      summary: join(
        `${target?.name ?? 'Insumo'}: ${formatQuantity(details.from, unit)} → ${formatQuantity(details.to, unit)} (${signed(details.difference, unit)})`,
        reason(details.reason),
      ),
    }
  },
  'auth.login_locked': () => ({ title: 'Login bloqueado', summary: 'Excesso de tentativas de senha' }),
  'auth.approval_locked': ({ details }) => ({
    title: 'Autorização bloqueada',
    summary: join('Excesso de tentativas', details.approverEmail && `e-mail tentado: ${details.approverEmail}`),
  }),
  'auth.password_change_locked': () => ({
    title: 'Troca de senha bloqueada',
    summary: 'Excesso de tentativas da senha atual',
  }),
  'user.created': ({ details, target }) => ({
    title: 'Criou usuário',
    summary: `${target?.name ?? ''} (${ROLE_LABELS[details.role] ?? details.role})`,
  }),
  'user.updated': ({ details, target }) => ({
    title: 'Editou usuário',
    summary: join(
      target?.name,
      Object.entries(details.changes ?? {})
        .map(([field, { from, to }]) => `${USER_FIELD_LABELS[field] ?? field}: ${userValue(field, from)} → ${userValue(field, to)}`)
        .join(', '),
    ),
  }),
  'user.password_reset': ({ target }) => ({ title: 'Redefiniu a senha', summary: target?.name ?? '' }),
  'user.password_changed': () => ({ title: 'Trocou a própria senha', summary: '' }),
}

// Ação desconhecida (nova no banco, ainda sem texto) aparece com o código cru, sem quebrar a tela.
export function describeAudit(entry) {
  const describe = DESCRIBERS[entry.action]
  if (!describe) return { title: entry.action, summary: '' }
  try {
    return describe({ ...entry, details: entry.details ?? {} })
  } catch {
    return { title: entry.action, summary: '' }
  }
}
