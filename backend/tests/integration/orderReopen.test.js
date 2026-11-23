import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'

describe('Mesa aguardando pagamento e reabertura da conta (spec 019)', () => {
  let server
  let staff
  let tableIds
  let picanha
  let refri
  let shiftId

  const api = (method, path, { role = 'manager', body } = {}) =>
    server.api(method, path, { token: role && staff[role].token, body })
  const reopen = (orderId, body, role = 'waiter') => api('POST', `/orders/${orderId}/reopen`, { role, body })
  const tableOf = async (tableId) => (await api('GET', '/tables', { role: 'waiter' })).json.data.find((t) => t.id === tableId)

  // Lança o item, envia, a cozinha termina; devolve o id do item.
  async function serve(orderId, menuItemId) {
    const itemId = (await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId } })).json.data.id
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'in_kitchen' } })).status, 200)
    await api('PATCH', `/order-items/${itemId}/status`, { role: 'kitchen', body: { status: 'preparing' } })
    await api('PATCH', `/order-items/${itemId}/status`, { role: 'kitchen', body: { status: 'ready' } })
    return itemId
  }
  const askBill = (orderId) => api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'ready_to_pay' } })

  async function orderReadyToPay(tableId = tableIds[0]) {
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
    await serve(orderId, picanha)
    assert.equal((await askBill(orderId)).status, 200)
    return orderId
  }

  before(async () => {
    await setupSchema()
    server = await startServer()
  })
  after(() => server.close())
  beforeEach(async () => {
    await resetDb()
    staff = await createStaff()
    tableIds = await createTables(2)
    shiftId = (await api('POST', '/shifts', { body: { openingFloat: 0 } })).json.data.id
    picanha = await createMenuItem({ name: 'Picanha na chapa', price: 89.9 })
    refri = await createMenuItem({ name: 'Refrigerante Lata', price: 7 })
  })

  test('GET /tables traz o status do pedido ativo; mesa livre → null', async () => {
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId: tableIds[0] } })).json.data.id
    assert.deepEqual(await tableOf(tableIds[0]), {
      id: tableIds[0], number: 1, status: 'occupied', activeOrderId: orderId, orderStatus: 'open',
    })
    assert.equal((await tableOf(tableIds[1])).orderStatus, null)

    await serve(orderId, picanha)
    assert.equal((await tableOf(tableIds[0])).orderStatus, 'in_kitchen')
    await askBill(orderId)
    assert.equal((await tableOf(tableIds[0])).orderStatus, 'ready_to_pay')
  })

  test('reabrir: volta para in_kitchen, lança mais um item, pede a conta de novo e encerra com o total novo', async () => {
    const orderId = await orderReadyToPay()
    // Pagamento parcial antes da reabertura continua valendo.
    assert.equal((await api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount: 50, method: 'pix' } })).status, 201)

    const res = await reopen(orderId, { reason: '  Cliente pediu refrigerante  ' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.json.data, { id: orderId, status: 'in_kitchen' })
    const table = await tableOf(tableIds[0])
    assert.deepEqual([table.status, table.orderStatus, table.activeOrderId], ['occupied', 'in_kitchen', orderId])

    await serve(orderId, refri)
    assert.equal((await askBill(orderId)).status, 200)
    const bill = (await api('GET', `/orders/${orderId}/bill`, { role: 'cashier' })).json.data
    assert.equal(bill.total, 96.9)
    assert.equal(bill.remainingBalance, 46.9)
    assert.equal(bill.payments.length, 1)

    await api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount: 46.9, method: 'card' } })
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'cashier', body: { status: 'closed' } })).status, 200)
    assert.deepEqual(await tableOf(tableIds[0]), {
      id: tableIds[0], number: 1, status: 'available', activeOrderId: null, orderStatus: null,
    })

    // Auditoria: quem reabriu, motivo limpo, valor já pago e alvo do pedido.
    const entries = (await api('GET', '/audit-logs?category=orders')).json.data.entries
    assert.equal(entries.length, 1)
    assert.equal(entries[0].action, 'order.reopened')
    assert.deepEqual(entries[0].user, { id: staff.waiter.id, name: staff.waiter.name, role: 'waiter' })
    assert.deepEqual(entries[0].details, { reason: 'Cliente pediu refrigerante', paidAmount: 50 })
    assert.deepEqual(entries[0].target, { orderId, tableNumber: 1 })
  })

  test('papéis: garçom, caixa, gerente e admin reabrem; cozinha → 403; sem token → 401', async () => {
    for (const role of ['waiter', 'cashier', 'manager', 'admin']) {
      const orderId = await orderReadyToPay()
      const res = await reopen(orderId, undefined, role)
      assert.equal(res.status, 200, role)
      // Libera a mesa para o próximo papel.
      await api('PATCH', `/orders/${orderId}/status`, { body: { status: 'canceled', reason: 'Teste' } })
    }
    const orderId = await orderReadyToPay()
    assert.equal((await reopen(orderId, {}, 'kitchen')).status, 403)
    assert.equal((await server.api('POST', `/orders/${orderId}/reopen`)).status, 401)
    assert.equal((await tableOf(tableIds[0])).orderStatus, 'ready_to_pay')

    // Sem motivo: reason null e nada pago.
    await reopen(orderId, { reason: '   ' })
    const { rows } = await query(`SELECT details FROM audit_logs WHERE action = 'order.reopened' ORDER BY id DESC LIMIT 1`)
    assert.deepEqual(rows[0].details, { reason: null, paidAmount: 0 })
  })

  test('transições inválidas → 409; inexistente → 404; motivo inválido → 422', async () => {
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId: tableIds[0] } })).json.data.id
    assert.equal((await reopen(orderId)).status, 409, 'open')
    await serve(orderId, picanha)
    const conflict = await reopen(orderId)
    assert.equal(conflict.status, 409, 'in_kitchen')
    assert.equal(conflict.json.error, 'Transição de status do pedido inválida.')

    await askBill(orderId)
    await api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount: 89.9, method: 'pix' } })
    await api('PATCH', `/orders/${orderId}/status`, { role: 'cashier', body: { status: 'closed' } })
    assert.equal((await reopen(orderId)).status, 409, 'closed')

    const canceled = (await api('POST', '/orders', { role: 'waiter', body: { tableId: tableIds[1] } })).json.data.id
    await api('PATCH', `/orders/${canceled}/status`, { body: { status: 'canceled', reason: 'Mesa errada' } })
    assert.equal((await reopen(canceled)).status, 409, 'canceled')

    assert.equal((await reopen('999999')).status, 404)

    const ready = await orderReadyToPay()
    for (const reason of ['x'.repeat(201), 42, { text: 'a' }]) {
      const res = await reopen(ready, { reason })
      assert.equal(res.status, 422, String(reason).slice(0, 10))
      assert.equal(res.json.code, 'VALIDATION_ERROR')
    }
    assert.equal((await reopen(ready, { reason: 'x'.repeat(200) })).status, 200)
    const { rows } = await query(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'order.reopened'`)
    assert.equal(rows[0].n, 1)
  })

  test('concorrência: duas reaberturas simultâneas → um 200, um 409 e um único registro de auditoria', async () => {
    const orderId = await orderReadyToPay()
    const results = await Promise.all([reopen(orderId, {}, 'waiter'), reopen(orderId, {}, 'cashier')])
    assert.deepEqual(results.map((res) => res.status).sort(), [200, 409])
    const { rows } = await query(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'order.reopened'`)
    assert.equal(rows[0].n, 1)
    assert.equal((await tableOf(tableIds[0])).orderStatus, 'in_kitchen')
  })

  test('paidAmount desconta o troco do pagamento em dinheiro', async () => {
    const orderId = await orderReadyToPay()
    const paid = await api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount: 100, method: 'cash' } })
    assert.equal(paid.json.data.changeAmount, 10.1)
    await reopen(orderId)
    const { rows } = await query(`SELECT details FROM audit_logs WHERE action = 'order.reopened'`)
    assert.deepEqual(rows[0].details, { reason: null, paidAmount: 89.9 })
  })

  test('conta quitada e reaberta: sem itens novos, pede a conta de novo e encerra', async () => {
    const orderId = await orderReadyToPay()
    await api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount: 89.9, method: 'pix' } })
    assert.equal((await reopen(orderId)).status, 200)
    assert.equal((await askBill(orderId)).status, 200)
    const bill = (await api('GET', `/orders/${orderId}/bill`, { role: 'cashier' })).json.data
    assert.equal(bill.remainingBalance, 0)
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'cashier', body: { status: 'closed' } })).status, 200)
  })

  test('taxa de serviço ligada antes de reabrir continua valendo sobre o item novo', async () => {
    const orderId = await orderReadyToPay()
    assert.equal((await api('PATCH', `/orders/${orderId}/service-tax`, { role: 'cashier', body: { enabled: true } })).status, 200)
    await reopen(orderId)
    await serve(orderId, refri)
    await askBill(orderId)
    const bill = (await api('GET', `/orders/${orderId}/bill`, { role: 'cashier' })).json.data
    assert.equal(bill.serviceTax, true)
    assert.equal(bill.subtotal, 96.9)
    assert.equal(bill.total, 106.59)
  })

  test('RN-02: o turno não encerra com um pedido reaberto', async () => {
    const orderId = await orderReadyToPay()
    await reopen(orderId)
    const res = await api('PATCH', `/shifts/${shiftId}/close`, { body: {} })
    assert.equal(res.status, 409)
    assert.equal(res.json.error, 'Não é possível encerrar o turno com pedidos ativos.')
  })

  test('RN-17: depois de reabrir, cancelar item já pago continua bloqueado', async () => {
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId: tableIds[0] } })).json.data.id
    const itemId = await serve(orderId, picanha)
    await askBill(orderId)
    await api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount: 89.9, method: 'pix' } })
    await reopen(orderId)
    const res = await api('PATCH', `/order-items/${itemId}/status`, { body: { status: 'canceled', reason: 'Desistiu' } })
    assert.equal(res.status, 409)
    assert.match(res.json.error, /já pago/)
  })
})
