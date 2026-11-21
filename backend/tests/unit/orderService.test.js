import '../support/env.js'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { OrderService } from '../../src/services/OrderService.js'
import {
  BadRequestError,
  ConflictError,
  DomainValidationError,
  ForbiddenError,
  NotFoundError,
} from '../../src/errors/AppError.js'

function makeOrderService(overrides = {}) {
  const orders = {
    transaction: (callback) => callback({}),
    lockById: async () => ({ id: '1', status: 'open', shiftId: '1', tableId: '1', serviceTax: true }),
    findItemById: async () => ({ id: '10', orderId: '1', status: 'pending' }),
    ...overrides.orders,
  }
  const menuItems = {
    findAvailableById: async () => null,
    ...overrides.menuItems,
  }
  const audit = { record: async () => {} }
  return new OrderService(orders, menuItems, audit)
}

describe('OrderService (validações unitárias de domínio)', () => {
  test('create exige tableId e rejeita mesa inexistente ou sem turno aberto', async () => {
    await assert.rejects(makeOrderService().create({}, { id: '1' }), BadRequestError)

    const noTable = makeOrderService({ orders: { tableExists: async () => false } })
    await assert.rejects(noTable.create({ tableId: '99' }, { id: '1' }), NotFoundError)

    const noShift = makeOrderService({
      orders: { tableExists: async () => true, findOpenShiftId: async () => null },
    })
    await assert.rejects(noShift.create({ tableId: '1' }, { id: '1' }), ConflictError)
  })

  test('addItem valida menuItemId, quantidade positiva e overflow de inteiro', async () => {
    const service = makeOrderService()
    await assert.rejects(service.addItem('1', {}), BadRequestError)
    for (const quantity of [0, -2, 1.5, 2147483648]) {
      await assert.rejects(service.addItem('1', { menuItemId: '1', quantity }), DomainValidationError)
    }
  })

  test('updateStatus valida papel, motivo ao cancelar e status desconhecido', async () => {
    const service = makeOrderService()
    await assert.rejects(service.updateStatus('1', { status: 'invalid' }, { id: '1', role: 'manager' }), BadRequestError)
    await assert.rejects(service.updateStatus('1', { status: 'closed' }, { id: '1', role: 'waiter' }), ForbiddenError)
    await assert.rejects(
      service.updateStatus('1', { status: 'canceled', reason: '   ' }, { id: '1', role: 'manager' }),
      DomainValidationError,
    )
  })

  test('addPayment valida método e limites numéricos do valor', async () => {
    const service = makeOrderService()
    await assert.rejects(service.addPayment('1', { amount: 10, method: 'crypto' }), DomainValidationError)
    for (const amount of [0, -10, 0.001, 100000000]) {
      await assert.rejects(service.addPayment('1', { amount, method: 'cash' }), DomainValidationError)
    }
  })
})
