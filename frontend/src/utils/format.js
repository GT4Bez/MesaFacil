export const formatMoney = (value) =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const ROLE_LABELS = {
  waiter: 'Garçom',
  kitchen: 'Cozinha',
  cashier: 'Caixa',
  manager: 'Gerente',
}

export const ORDER_STATUS_LABELS = {
  open: 'Aberto',
  in_kitchen: 'Na cozinha',
  ready_to_pay: 'Aguardando pagamento',
  closed: 'Encerrado',
  canceled: 'Cancelado',
}

export const ITEM_STATUS_LABELS = {
  pending: 'Pendente',
  sent: 'Enviado',
  preparing: 'Em preparo',
  ready: 'Pronto',
  canceled: 'Cancelado',
}

export const PAYMENT_METHOD_LABELS = {
  cash: 'Dinheiro',
  card: 'Cartão',
  pix: 'Pix',
}
