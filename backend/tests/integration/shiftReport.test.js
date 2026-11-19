import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'

describe('Relatório do turno (RN-10)', () => {
  let server
  let staff
  let tableIds
  let menu
  let shiftId

  const api = (method, path, { role = 'manager', body } = {}) =>
    server.api(method, path, { token: role && staff[role].token, body })
  const report = (role = 'manager', id = shiftId) => api('GET', `/shifts/${id}/report`, { role })

  // Abre pedido, lança itens e envia à cozinha; devolve { orderId, itemIds }.
  async function orderWith(tableId, items) {
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
    const itemIds = []
    for (const [menuItemId, quantity] of items) {
      const res = await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId, quantity } })
      itemIds.push(res.json.data.id)
    }
    await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'in_kitchen' } })
    return { orderId, itemIds }
  }

  async function finishKitchen(itemIds) {
    for (const id of itemIds) {
      await api('PATCH', `/order-items/${id}/status`, { role: 'kitchen', body: { status: 'preparing' } })
      await api('PATCH', `/order-items/${id}/status`, { role: 'kitchen', body: { status: 'ready' } })
    }
  }

  const pay = (orderId, amount, method) =>
    api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount, method } })
  const setStatus = (orderId, status, role = 'waiter') =>
    api('PATCH', `/orders/${orderId}/status`, { role, body: { status } })

  before(async () => {
    await setupSchema()
    server = await startServer()
  })
  after(() => server.close())
  beforeEach(async () => {
    await resetDb()
    staff = await createStaff()
    tableIds = await createTables(3)
    menu = {
      picanha: await createMenuItem({ name: 'Picanha', price: 89.9 }),
      suco: await createMenuItem({ name: 'Suco', category: 'Bebidas', price: 10 }),
    }
    shiftId = (await api('POST', '/shifts')).json.data.id
  })

  test('apenas gerente; turno inexistente → 404', async () => {
    assert.equal((await report('waiter')).status, 403)
    assert.equal((await report('cashier')).status, 403)
    assert.equal((await report('kitchen')).status, 403)
    assert.equal((await report(null)).status, 401)
    assert.equal((await report('manager', '999')).status, 404)
    assert.equal((await report('manager', 'abc')).status, 400)
  })

  test('turno sem movimento devolve zeros e as três formas de pagamento', async () => {
    const res = await report()
    assert.equal(res.status, 200)
    const data = res.json.data
    assert.equal(data.shift.id, shiftId)
    assert.equal(data.shift.status, 'open')
    assert.equal(data.shift.openedBy, staff.manager.name)
    assert.equal(data.totalShift, 0)
    assert.equal(data.ordersClosed, 0)
    assert.equal(data.averageTicket, 0)
    assert.deepEqual(data.byPaymentMethod, [
      { method: 'cash', total: 0, count: 0 },
      { method: 'card', total: 0, count: 0 },
      { method: 'pix', total: 0, count: 0 },
    ])
    assert.deepEqual(data.byMenuItem, [])
    assert.deepEqual(data.cancellations, { ordersCount: 0, orders: [], items: [] })
  })

  test('totais batem com o banco: pagamentos parciais, parcial em aberto e pedido cancelado', async () => {
    // Pedido 1: picanha x2 + suco (cancelado pelo gerente) → 179.80, pago em cash + card, fechado.
    const first = await orderWith(tableIds[0], [[menu.picanha, 2], [menu.suco, 1]])
    await api('PATCH', `/order-items/${first.itemIds[1]}/status`, {
      body: { status: 'canceled', reason: 'Sem estoque' },
    })
    await finishKitchen([first.itemIds[0]])
    await setStatus(first.orderId, 'ready_to_pay')
    await pay(first.orderId, 100, 'cash')
    await pay(first.orderId, 79.8, 'card')
    assert.equal((await setStatus(first.orderId, 'closed', 'cashier')).status, 200)

    // Pedido 2: suco x3 → 30, pago em pix, fechado.
    const second = await orderWith(tableIds[1], [[menu.suco, 3]])
    await finishKitchen(second.itemIds)
    await setStatus(second.orderId, 'ready_to_pay')
    await pay(second.orderId, 30, 'pix')
    await setStatus(second.orderId, 'closed', 'cashier')

    // Pedido 3: ainda aberto, com pagamento parcial (entra no total parcial, não nas vendas).
    const third = await orderWith(tableIds[2], [[menu.picanha, 1]])
    await pay(third.orderId, 20, 'cash')

    const partial = (await report()).json.data
    const { rows } = await query(
      `SELECT sum(p.amount) AS total FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.shift_id = $1`,
      [shiftId],
    )
    assert.equal(partial.totalShift, Number(rows[0].total))
    assert.equal(partial.totalShift, 229.8)
    assert.equal(partial.ordersClosed, 2)
    assert.equal(partial.averageTicket, 114.9)
    assert.deepEqual(partial.byPaymentMethod, [
      { method: 'cash', total: 120, count: 2 },
      { method: 'card', total: 79.8, count: 1 },
      { method: 'pix', total: 30, count: 1 },
    ])
    assert.deepEqual(partial.byMenuItem, [
      { menuItemId: menu.picanha, name: 'Picanha', quantity: 2, total: 179.8 },
      { menuItemId: menu.suco, name: 'Suco', quantity: 3, total: 30 },
    ])
    assert.deepEqual(partial.cancellations.items, [
      { orderItemId: first.itemIds[1], name: 'Suco', quantity: 1, reason: 'Sem estoque', by: staff.manager.name },
    ])

    // Pedido 4: cancelado inteiro → não altera faturamento nem ticket médio.
    const fourth = await orderWith(tableIds[0], [[menu.picanha, 1]])
    assert.equal(
      (await api('PATCH', `/orders/${fourth.orderId}/status`, { body: { status: 'canceled', reason: 'Cliente desistiu' } })).status,
      200,
    )
    const afterCancel = (await report()).json.data
    assert.equal(afterCancel.totalShift, 229.8)
    assert.equal(afterCancel.averageTicket, 114.9)
    assert.deepEqual(afterCancel.byMenuItem, partial.byMenuItem)
    assert.deepEqual(afterCancel.cancellations.orders, [
      { orderId: fourth.orderId, reason: 'Cliente desistiu', by: staff.manager.name },
    ])
    assert.equal(afterCancel.cancellations.ordersCount, 1)
    // Itens do pedido cancelado aparecem só no pedido, não na lista de itens.
    assert.equal(afterCancel.cancellations.items.length, 1)

    // Fecha o pedido 3 usando dinheiro com troco (saldo 69.90, recebido 100, troco 30.10): entra só 69.90 no turno.
    await finishKitchen(third.itemIds)
    await setStatus(third.orderId, 'ready_to_pay')
    const cashRes = await pay(third.orderId, 100, 'cash')
    assert.equal(cashRes.status, 201)
    assert.equal(cashRes.json.data.changeAmount, 30.1)
    await setStatus(third.orderId, 'closed', 'cashier')
    assert.equal((await api('PATCH', `/shifts/${shiftId}/close`)).status, 200)

    const final = (await report()).json.data
    assert.equal(final.shift.status, 'closed')
    assert.ok(final.shift.closedAt)
    assert.equal(final.totalShift, 299.7)
    assert.deepEqual(final.byPaymentMethod[0], { method: 'cash', total: 189.9, count: 3 })
    assert.equal(final.ordersClosed, 3)
    assert.equal(final.averageTicket, 99.9)
    assert.deepEqual(final.byMenuItem[0], { menuItemId: menu.picanha, name: 'Picanha', quantity: 3, total: 269.7 })
  })
})
