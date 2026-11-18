import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'

describe('Fluxo de mesas, turnos, pedidos, itens e caixa', () => {
  let server
  let staff
  let tableIds
  let menu

  // role: papel do usuário que faz a chamada (null = sem token).
  const api = (method, path, { role = 'manager', body } = {}) =>
    server.api(method, path, { token: role && staff[role].token, body })

  const openShift = () => api('POST', '/shifts')
  const createOrder = async (tableId = tableIds[0]) =>
    (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
  const addItem = async (orderId, menuItemId, quantity = 1) =>
    (await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId, quantity } })).json.data.id

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
      indisponivel: await createMenuItem({ name: 'Indisponível', price: 50, available: false }),
    }
  })

  test('exige autenticação (401) em todas as rotas operacionais', async () => {
    const endpoints = [
      ['GET', '/tables'],
      ['GET', '/shifts/active'],
      ['POST', '/shifts'],
      ['PATCH', '/shifts/1/close'],
      ['GET', '/menu-items'],
      ['POST', '/orders'],
      ['GET', '/orders/1'],
      ['PATCH', '/orders/1/status'],
      ['POST', '/orders/1/items'],
      ['PATCH', '/order-items/1/quantity'],
      ['PATCH', '/order-items/1/status'],
      ['GET', '/orders/1/bill'],
      ['POST', '/orders/1/payments'],
    ]
    for (const [method, path] of endpoints) {
      const res = await api(method, path, { role: null })
      assert.equal(res.status, 401, `${method} ${path} deveria retornar 401`)
    }
  })

  test('turnos (RN-02): apenas gerente abre/encerra; índice único bloqueia segundo turno aberto', async () => {
    const initial = await api('GET', '/shifts/active', { role: 'waiter' })
    assert.equal(initial.status, 200)
    assert.equal(initial.json.data, null)

    assert.equal((await api('POST', '/shifts', { role: 'waiter' })).status, 403)

    const opened = await openShift()
    assert.equal(opened.status, 201)
    assert.equal(opened.json.data.status, 'open')
    const shiftId = opened.json.data.id

    // 409 vem do índice parcial shifts_single_open_idx, não de uma checagem em código.
    assert.equal((await openShift()).status, 409)
    const { rows } = await query(`SELECT count(*)::int AS total FROM shifts`)
    assert.equal(rows[0].total, 1)

    const orderId = await createOrder()
    assert.equal((await api('PATCH', `/shifts/${shiftId}/close`)).status, 409)

    await api('PATCH', `/orders/${orderId}/status`, { body: { status: 'canceled' } })
    const closed = await api('PATCH', `/shifts/${shiftId}/close`)
    assert.equal(closed.status, 200)
    assert.equal(closed.json.data.status, 'closed')

    assert.equal((await api('PATCH', `/shifts/${shiftId}/close`)).status, 409)
    assert.equal((await api('PATCH', '/shifts/999/close')).status, 404)
  })

  test('mesas e abertura de pedido (RN-01, RN-02 e RBAC)', async () => {
    assert.equal((await api('POST', '/orders', { role: 'waiter', body: { tableId: tableIds[0] } })).status, 409)
    await openShift()

    assert.equal((await api('POST', '/orders', { role: 'waiter', body: {} })).status, 400)
    assert.equal((await api('POST', '/orders', { role: 'waiter', body: { tableId: '999' } })).status, 404)
    assert.equal((await api('POST', '/orders', { role: 'kitchen', body: { tableId: tableIds[0] } })).status, 403)
    assert.equal((await api('POST', '/orders', { role: 'cashier', body: { tableId: tableIds[0] } })).status, 403)

    const created = await api('POST', '/orders', { role: 'waiter', body: { tableId: tableIds[0] } })
    assert.equal(created.status, 201)
    const orderId = created.json.data.id

    // 409 vem do índice parcial orders_single_active_per_table_idx.
    assert.equal((await api('POST', '/orders', { role: 'waiter', body: { tableId: tableIds[0] } })).status, 409)
    const { rows } = await query(`SELECT count(*)::int AS total FROM orders WHERE table_id = $1`, [tableIds[0]])
    assert.equal(rows[0].total, 1)

    const tables = await api('GET', '/tables', { role: 'waiter' })
    assert.deepEqual(tables.json.data, [
      { id: tableIds[0], number: 1, status: 'occupied', activeOrderId: orderId },
      { id: tableIds[1], number: 2, status: 'available', activeOrderId: null },
    ])
  })

  test('cardápio e snapshot de preço (RN-09) com proteção a overflow inteiro', async () => {
    await openShift()
    const listed = await api('GET', '/menu-items', { role: 'waiter' })
    assert.deepEqual(listed.json.data.map((item) => item.name).sort(), ['Picanha', 'Suco'])

    const orderId = await createOrder()
    assert.equal(
      (await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: menu.indisponivel } })).status,
      404,
    )
    assert.equal(
      (await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: menu.picanha, quantity: 9999999999999 } })).status,
      422,
    )

    const added = await api('POST', `/orders/${orderId}/items`, {
      role: 'waiter',
      body: { menuItemId: menu.picanha, quantity: 2, notes: '  ao ponto  ' },
    })
    assert.equal(added.status, 201)

    await query(`UPDATE menu_items SET price = 120 WHERE id = $1`, [menu.picanha])
    const order = await api('GET', `/orders/${orderId}`, { role: 'waiter' })
    assert.equal(order.json.data.items[0].unitPrice, 89.9)
    assert.equal(order.json.data.items[0].notes, 'ao ponto')
  })

  test('RBAC e validações nas transições de pedido, cancelamento pendente e pagamento', async () => {
    await openShift()
    const orderId = await createOrder()
    const pendingItemId = await addItem(orderId, menu.suco)

    const cancel = (role) =>
      api('PATCH', `/order-items/${pendingItemId}/status`, { role, body: { status: 'canceled' } })
    assert.equal((await cancel('kitchen')).status, 403)
    assert.equal((await cancel('cashier')).status, 403)
    assert.equal(
      (await api('PATCH', `/orders/${orderId}/status`, { role: 'kitchen', body: { status: 'in_kitchen' } })).status,
      403,
    )
    assert.equal((await cancel('waiter')).status, 200)

    const pay = (amount) => api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount, method: 'pix' } })
    const tinyPay = await pay(0.001)
    assert.equal(tinyPay.status, 422)
    assert.equal(tinyPay.json.error, 'Valor do pagamento inválido.')
    assert.equal((await pay(1e12)).status, 422)
  })

  test('fluxo completo ponta a ponta (RN-03 a RN-08) com RBAC de fechamento', async () => {
    await openShift()
    const orderId = await createOrder()
    const status = (role, value) => api('PATCH', `/orders/${orderId}/status`, { role, body: { status: value } })
    const itemStatus = (itemId, role, body) => api('PATCH', `/order-items/${itemId}/status`, { role, body })
    const quantity = (itemId, value) =>
      api('PATCH', `/order-items/${itemId}/quantity`, { role: 'waiter', body: { quantity: value } })

    assert.equal((await status('waiter', 'in_kitchen')).status, 409)

    const item1 = await addItem(orderId, menu.picanha, 1)
    const item2 = await addItem(orderId, menu.suco, 2)

    assert.equal((await quantity(item2, 0)).status, 422)
    assert.equal((await quantity(item2, 1)).status, 200)
    assert.equal((await status('waiter', 'ready_to_pay')).status, 409)

    assert.equal((await status('waiter', 'in_kitchen')).status, 200)
    assert.equal((await quantity(item1, 3)).status, 409)

    // RN-05: cancelar item enviado exige gerente e motivo, que fica persistido.
    assert.equal((await itemStatus(item2, 'waiter', { status: 'canceled', reason: 'erro' })).status, 403)
    assert.equal((await itemStatus(item2, 'manager', { status: 'canceled', reason: '  ' })).status, 422)
    assert.equal((await itemStatus(item2, 'manager', { status: 'canceled', reason: 'Sem estoque' })).status, 200)
    const { rows } = await query(`SELECT canceled_by, cancellation_reason FROM order_items WHERE id = $1`, [item2])
    assert.equal(String(rows[0].canceled_by), staff.manager.id)
    assert.equal(rows[0].cancellation_reason, 'Sem estoque')

    assert.equal((await itemStatus(item1, 'waiter', { status: 'preparing' })).status, 403)
    assert.equal((await itemStatus(item1, 'kitchen', { status: 'ready' })).status, 409)
    assert.equal((await itemStatus(item1, 'kitchen', { status: 'preparing' })).status, 200)

    // RN-06: bloqueia ready_to_pay enquanto há item em preparo.
    assert.equal((await status('waiter', 'ready_to_pay')).status, 409)

    assert.equal((await itemStatus(item1, 'kitchen', { status: 'ready' })).status, 200)
    assert.equal((await status('kitchen', 'ready_to_pay')).status, 403)
    assert.equal((await status('waiter', 'ready_to_pay')).status, 200)

    // RN-08: conta ignora o item cancelado.
    const bill = await api('GET', `/orders/${orderId}/bill?serviceTax=true`, { role: 'cashier' })
    assert.equal(bill.json.data.subtotal, 89.9)
    assert.equal(bill.json.data.serviceTaxAmount, 8.99)
    assert.equal(bill.json.data.total, 98.89)

    // RN-07: pagamento parcial + bloqueio de fechamento por garçom/com saldo aberto.
    const pay = (role, amount, method) => api('POST', `/orders/${orderId}/payments`, { role, body: { amount, method } })
    assert.equal((await pay('waiter', 50, 'pix')).status, 403)
    assert.equal((await pay('cashier', 50, 'pix')).status, 201)
    assert.equal((await status('cashier', 'closed')).status, 409)

    assert.equal((await pay('cashier', 39.9, 'cash')).status, 201)
    assert.equal((await status('waiter', 'closed')).status, 403)
    assert.equal((await status('cashier', 'closed')).status, 200)

    const tables = await api('GET', '/tables', { role: 'waiter' })
    assert.equal(tables.json.data[0].status, 'available')
    assert.equal(tables.json.data[0].activeOrderId, null)
  })
})
