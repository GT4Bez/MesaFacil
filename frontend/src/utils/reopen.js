import { ORDER_STATUS_LABELS } from './format'

// Spec 019: depois de uma reabertura recusada, o status recarregado explica o que aconteceu.
// `null` quando a conta continua aguardando pagamento (o erro fica no modal para nova tentativa).
export function reopenConflictMessage(status) {
  if (!status || status === 'ready_to_pay') return null
  if (status === 'in_kitchen') return 'A conta já tinha sido reaberta por outra pessoa.'
  const label = ORDER_STATUS_LABELS[status]?.toLowerCase() ?? status
  return `A conta não pode mais ser reaberta: o pedido está ${label}.`
}
