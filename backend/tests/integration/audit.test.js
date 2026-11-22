import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'
import { OrderService } from '../../src/services/OrderService.js'
import { OrderRepository } from '../../src/repositories/OrderRepository.js'
import { MenuItemRepository } from '../../src/repositories/MenuItemRepository.js'

describe('Cancelamento de pedido com motivo e auditoria (RN-11)', () => {
  let server
  let staff
  let tableIds
  let menu
  let shiftId

  const api = (method, path, { role = 'manager', body } = {}) =>
    server.api(method, path, { token: role && staff[role].token, body })

  const createOrder = async (tableId = tableIds[0]) =>
    (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
  const addItem = async (orderId, menuItemId) =>
    (await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId } })).json.data.id
  const cancelOrder = (orderId, { role = 'manager', reason } = {}) =>
    api('PATCH', `/orders/${orderId}/status`, { role, body: { status: 'canceled', reason } })
  const auditLogs = async (action) =>
    (await query(`SELECT * FROM audit_logs WHERE action = $1 ORDER BY id`, [action])).rows

  before(async () => {
    await setupSchema()
    server = await startServer()
  })
  after(() => server.close())
  beforeEach(async () => {
    await resetDb()
    staff = await createStaff()
    tableIds = await createTables(2)
    menu = {
      picanha: await createMenuItem({ name: 'Picanha', price: 89.9 }),
      suco: await createMenuItem({ name: 'Suco', category: 'Bebidas', price: 10 }),
    }
    shiftId = (await api('POST', '/shifts', { body: { openingFloat: 0 } })).json.data.id
  })

  test('cancelar pedido exige gerente, motivo e ausência de pagamento', async () => {
    const orderId = await createOrder()
    await addItem(orderId, menu.suco)

    assert.equal((await cancelOrder(orderId, { role: 'waiter', reason: 'erro' })).status, 403)
    assert.equal((await cancelOrder(orderId)).status, 422)
    assert.equal((await cancelOrder(orderId, { reason: '   ' })).status, 422)

    await api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount: 5, method: 'pix' } })
    const withPayment = await cancelOrder(orderId, { reason: 'Cliente desistiu' })
    assert.equal(withPayment.status, 409)
    assert.equal(withPayment.json.error, 'Pedido com pagamento registrado não pode ser cancelado.')

    const { rows } = await query(`SELECT status FROM orders WHERE id = $1`, [orderId])
    assert.equal(rows[0].status, 'open')
    assert.equal((await auditLogs('order.canceled')).length, 0)
  })

  test('cancelar pedido cancela os itens ativos, libera a mesa e grava auditoria', async () => {
    const orderId = await createOrder()
    const sent = await addItem(orderId, menu.picanha)
    await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'in_kitchen' } })
    const pending = await addItem(orderId, menu.suco)
    const removed = await addItem(orderId, menu.suco)
    await api('PATCH', `/order-items/${removed}/status`, { role: 'waiter', body: { status: 'canceled' } })

    const res = await cancelOrder(orderId, { reason: '  Cliente desistiu  ' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.json.data, { id: orderId, status: 'canceled' })

    const { rows: items } = await query(
      `SELECT id, status, canceled_by, cancellation_reason FROM order_items WHERE order_id = $1 ORDER BY id`,
      [orderId],
    )
    for (const item of items.filter((row) => [sent, pending].includes(String(row.id)))) {
      assert.equal(item.status, 'canceled')
      assert.equal(String(item.canceled_by), staff.manager.id)
      assert.equal(item.cancellation_reason, 'Cliente desistiu')
    }
    // O item já removido antes mantém o cancelamento original (sem responsável).
    const previous = items.find((row) => String(row.id) === removed)
    assert.equal(previous.canceled_by, null)

    const order = await api('GET', `/orders/${orderId}`, { role: 'waiter' })
    assert.equal(order.json.data.status, 'canceled')
    assert.deepEqual(order.json.data.cancellation, {
      reason: 'Cliente desistiu',
      canceledBy: { id: staff.manager.id, name: staff.manager.name },
    })

    const tables = await api('GET', '/tables', { role: 'waiter' })
    assert.equal(tables.json.data[0].status, 'available')

    const [log] = await auditLogs('order.canceled')
    assert.equal(String(log.user_id), staff.manager.id)
    assert.equal(String(log.shift_id), shiftId)
    assert.equal(String(log.entity_id), orderId)
    assert.equal(log.entity, 'order')
    assert.deepEqual(log.details, { reason: 'Cliente desistiu', previousStatus: 'in_kitchen' })

    assert.equal((await cancelOrder(orderId, { reason: 'de novo' })).status, 409)
  })

  test('pedido não cancelado traz cancellation nulo', async () => {
    const orderId = await createOrder()
    const order = await api('GET', `/orders/${orderId}`, { role: 'waiter' })
    assert.equal(order.json.data.cancellation, null)
  })

  test('cancelar item enviado grava auditoria; remover item pendente não', async () => {
    const orderId = await createOrder()
    const sent = await addItem(orderId, menu.picanha)
    await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'in_kitchen' } })
    const pending = await addItem(orderId, menu.suco)

    await api('PATCH', `/order-items/${pending}/status`, { role: 'waiter', body: { status: 'canceled' } })
    const res = await api('PATCH', `/order-items/${sent}/status`, {
      body: { status: 'canceled', reason: 'Sem estoque' },
    })
    assert.equal(res.status, 200)

    const logs = await auditLogs('order_item.canceled')
    assert.equal(logs.length, 1)
    assert.equal(String(logs[0].entity_id), sent)
    assert.equal(String(logs[0].shift_id), shiftId)
    assert.deepEqual(logs[0].details, { orderId, reason: 'Sem estoque', previousStatus: 'sent' })
  })

  test('abrir e encerrar turno gravam auditoria', async () => {
    await api('PUT', `/shifts/${shiftId}/count`, { role: 'cashier', body: { declared: { cash: 0, card: 0, pix: 0 } } })
    assert.equal((await api('PATCH', `/shifts/${shiftId}/close`)).status, 200)
    const opened = await auditLogs('shift.opened')
    const closed = await auditLogs('shift.closed')
    assert.equal(opened.length, 1)
    assert.equal(closed.length, 1)
    for (const log of [...opened, ...closed]) {
      assert.equal(String(log.shift_id), shiftId)
      assert.equal(String(log.entity_id), shiftId)
      assert.equal(String(log.user_id), staff.manager.id)
    }

    // Segunda tentativa de fechar falha e não grava auditoria.
    assert.equal((await api('PATCH', `/shifts/${shiftId}/close`)).status, 409)
    assert.equal((await auditLogs('shift.closed')).length, 1)
  })

  test('mudança de preço do cardápio grava auditoria; outras alterações não', async () => {
    const patch = (body) => api('PATCH', `/menu-items/${menu.suco}`, { body })

    assert.equal((await patch({ name: 'Suco natural' })).status, 200)
    assert.equal((await patch({ price: 10 })).status, 200)
    assert.equal((await auditLogs('menu_item.price_changed')).length, 0)

    assert.equal((await patch({ price: 12.5 })).status, 200)
    const [log] = await auditLogs('menu_item.price_changed')
    assert.equal(String(log.entity_id), menu.suco)
    assert.equal(String(log.shift_id), shiftId)
    assert.deepEqual(log.details, { from: 10, to: 12.5 })

    // Sem turno aberto, o registro fica sem shift_id.
    await api('PUT', `/shifts/${shiftId}/count`, { role: 'cashier', body: { declared: { cash: 0, card: 0, pix: 0 } } })
    await api('PATCH', `/shifts/${shiftId}/close`)
    await patch({ price: 13 })
    const logs = await auditLogs('menu_item.price_changed')
    assert.equal(logs[1].shift_id, null)
  })

  test('se a auditoria falhar, o cancelamento sofre rollback', async () => {
    const orderId = await createOrder()
    await addItem(orderId, menu.suco)

    const failingAudit = { record: async () => { throw new Error('falha simulada na auditoria') } }
    const service = new OrderService(new OrderRepository(), new MenuItemRepository(), failingAudit)

    await assert.rejects(
      service.updateStatus(orderId, { status: 'canceled', reason: 'teste' }, staff.manager),
      /falha simulada/,
    )

    const { rows: [order] } = await query(`SELECT status, canceled_by FROM orders WHERE id = $1`, [orderId])
    assert.equal(order.status, 'open')
    assert.equal(order.canceled_by, null)
    const { rows: items } = await query(`SELECT status FROM order_items WHERE order_id = $1`, [orderId])
    assert.deepEqual(items.map((item) => item.status), ['pending'])
    const { rows: [table] } = await query(`SELECT status FROM tables WHERE id = $1`, [tableIds[0]])
    assert.equal(table.status, 'occupied')
  })
})
