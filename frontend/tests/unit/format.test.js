import { describe, expect, it } from 'vitest'
import {
  formatMoney,
  ITEM_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  ROLE_LABELS,
} from '../../src/utils/format'

describe('format utils', () => {
  it('formata valores numéricos e strings em moeda BRL', () => {
    expect(formatMoney(89.9)).toMatch(/R\$\s*89,90/)
    expect(formatMoney('10')).toMatch(/R\$\s*10,00/)
  })

  it('mapeia todos os papéis (incluindo admin), status e pagamentos', () => {
    expect(ROLE_LABELS).toEqual({
      admin: 'Administrador',
      waiter: 'Garçom',
      kitchen: 'Cozinha',
      cashier: 'Caixa',
      manager: 'Gerente',
    })
    expect(ORDER_STATUS_LABELS.ready_to_pay).toBe('Aguardando pagamento')
    expect(ITEM_STATUS_LABELS.preparing).toBe('Em preparo')
    expect(PAYMENT_METHOD_LABELS.pix).toBe('Pix')
  })
})
