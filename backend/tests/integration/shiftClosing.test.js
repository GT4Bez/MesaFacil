import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'

describe('Fechamento do turno com conferência cega (RN-14)', () => {
  let server
  let staff
  let tableIds
  let menu
  let shiftId

  const api = (method, path, { role = 'manager', body } = {}) =>
    server.api(method, path, { token: role && staff[role].token, body })

  const count = (declared, { role = 'cashier', note, id = shiftId } = {}) =>
    api('PUT', `/shifts/${id}/count`, { role, body: { declared, note } })
  const close = (reason, id = shiftId) => api('PATCH', `/shifts/${id}/close`, { body: { reason } })
  const auditLogs = async (action) =>
    (await query(`SELECT * FROM audit_logs WHERE action = $1 ORDER BY id`, [action])).rows

  // Pedido com Picanha (89,90) + Suco (10,00) = 99,90, pago e encerrado com os pagamentos dados.
  async function paidOrder(payments, tableId = tableIds[0]) {
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
    const items = []
    for (const menuItemId of [menu.picanha, menu.suco]) {
      items.push((await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId } })).json.data.id)
    }
    await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'in_kitchen' } })
    for (const itemId of items) {
      for (const status of ['preparing', 'ready']) {
        await api('PATCH', `/order-items/${itemId}/status`, { role: 'kitchen', body: { status } })
      }
    }
    await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'ready_to_pay' } })
    for (const [method, amount] of payments) {
      const res = await api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { method, amount } })
      assert.equal(res.status, 201)
    }
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'cashier', body: { status: 'closed' } })).status, 200)
    return orderId
  }
  const movement = (type, amount, reason = 'Teste') =>
    api('POST', `/shifts/${shiftId}/cash-movements`, { role: 'cashier', body: { type, amount, reason } })

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
    shiftId = (await api('POST', '/shifts', { body: { openingFloat: 100 } })).json.data.id
  })

  // Fundo 100 + dinheiro líquido 50 (60 com troco de 10) − sangria 30 + reforço 20 = 140; Pix 49,90.
  async function busyShift() {
    await paidOrder([
      ['pix', 49.9],
      ['cash', 60],
    ])
    assert.equal((await movement('withdrawal', 30)).status, 201)
    assert.equal((await movement('reinforcement', 20)).status, 201)
  }

  test('caixa conta sem ver o esperado; gerente encerra sem diferença; relatório mostra a conferência', async () => {
    await busyShift()

    const counted = await count({ cash: 140, card: 0, pix: 49.9 }, { note: '  gaveta conferida  ' })
    assert.equal(counted.status, 200)
    assert.deepEqual(counted.json.data.declared, { cash: 140, card: 0, pix: 49.9 })
    assert.equal(counted.json.data.note, 'gaveta conferida')
    assert.ok(!JSON.stringify(counted.json).includes('expected'), 'a resposta da contagem não pode trazer o esperado')

    // O caixa só sabe que a contagem foi feita.
    const active = (await api('GET', '/shifts/active', { role: 'cashier' })).json.data
    assert.ok(active.countedAt)
    assert.ok(!JSON.stringify(active).includes('140'))

    const closed = await close()
    assert.equal(closed.status, 200)
    assert.equal(closed.json.data.status, 'closed')
    assert.deepEqual(closed.json.data.closing.methods, [
      { method: 'cash', declared: 140, expected: 140, difference: 0 },
      { method: 'card', declared: 0, expected: 0, difference: 0 },
      { method: 'pix', declared: 49.9, expected: 49.9, difference: 0 },
    ])
    assert.equal(closed.json.data.closing.countedBy, staff.cashier.name)
    assert.equal(closed.json.data.closing.reason, null)

    const { rows } = await query(`SELECT closed_by, closing_note FROM shifts WHERE id = $1`, [shiftId])
    assert.equal(String(rows[0].closed_by), staff.manager.id)
    assert.equal(rows[0].closing_note, null)

    const report = (await api('GET', `/shifts/${shiftId}/report`)).json.data
    assert.equal(report.shift.closedBy, staff.manager.name)
    assert.equal(report.closing.stale, false)
    assert.equal(report.closing.note, 'gaveta conferida')
    assert.deepEqual(report.closing.methods, closed.json.data.closing.methods)
  })

  test('diferença exige motivo do gerente (422); com motivo encerra e audita as diferenças', async () => {
    await busyShift()
    assert.equal((await count({ cash: 137.5, card: 0, pix: 49.9 })).status, 200)

    // O relatório do gerente já mostra a diferença antes do encerramento.
    const before = (await api('GET', `/shifts/${shiftId}/report`)).json.data
    assert.equal(before.closing.methods[0].difference, -2.5)
    assert.equal(before.closing.reason, null)

    const missing = await close('   ')
    assert.equal(missing.status, 422)
    assert.equal(missing.json.error, 'Há diferença na conferência: informe o motivo.')

    const res = await close('Faltou troco de 2,50')
    assert.equal(res.status, 200)
    assert.equal(res.json.data.closing.methods[0].difference, -2.5)

    const [counted] = await auditLogs('shift.counted')
    assert.equal(String(counted.user_id), staff.cashier.id)
    assert.deepEqual(counted.details, { declared: { cash: 137.5, card: 0, pix: 49.9 }, note: null })
    const [closedLog] = await auditLogs('shift.closed')
    assert.equal(closedLog.details.reason, 'Faltou troco de 2,50')
    assert.deepEqual(
      closedLog.details.closing.map(({ method, difference }) => [method, difference]),
      [['cash', -2.5], ['card', 0], ['pix', 0]],
    )
    const report = (await api('GET', `/shifts/${shiftId}/report`)).json.data
    assert.equal(report.closing.reason, 'Faltou troco de 2,50')
  })

  test('declarados obrigatórios e ≥ 0 (422); só o caixa (e o admin) conta (403)', async () => {
    const invalid = [
      undefined,
      {},
      { cash: 10, card: 0 },
      { cash: -1, card: 0, pix: 0 },
      { cash: '10', card: 0, pix: 0 },
      { cash: Number.NaN, card: 0, pix: 0 },
    ]
    for (const declared of invalid) {
      assert.equal((await count(declared)).status, 422, JSON.stringify(declared))
    }
    for (const role of ['waiter', 'kitchen', 'manager']) {
      assert.equal((await count({ cash: 100, card: 0, pix: 0 }, { role })).status, 403, role)
    }
    assert.equal((await count({ cash: 100, card: 0, pix: 0 }, { role: null })).status, 401)
    assert.equal((await count({ cash: 100, card: 0, pix: 0 }, { role: 'admin' })).status, 200)
    assert.equal((await count({ cash: 100, card: 0, pix: 0 }, { id: '999999' })).status, 404)
  })

  test('encerrar exige a contagem (409); com pedido ativo nem conta nem encerra (409)', async () => {
    const noCount = await close()
    assert.equal(noCount.status, 409)
    assert.equal(noCount.json.error, 'O caixa ainda não fez a contagem de fechamento.')

    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId: tableIds[1] } })).json.data.id
    const busy = await count({ cash: 100, card: 0, pix: 0 })
    assert.equal(busy.status, 409)
    assert.equal(busy.json.error, 'Feche as comandas abertas antes da contagem.')
    const { rows } = await query(`SELECT count(*)::int AS total FROM shift_counts`)
    assert.equal(rows[0].total, 0)

    await api('PATCH', `/orders/${orderId}/status`, { body: { status: 'canceled', reason: 'Desistiu' } })
    assert.equal((await count({ cash: 100, card: 0, pix: 0 })).status, 200)
    // Pedido aberto depois da contagem: RN-02 continua valendo no encerramento.
    await api('POST', '/orders', { role: 'waiter', body: { tableId: tableIds[1] } })
    assert.equal((await close()).status, 409)
    assert.equal((await query(`SELECT status FROM shifts WHERE id = $1`, [shiftId])).rows[0].status, 'open')
  })

  test('movimento depois da contagem invalida a contagem (409) até o caixa recontar', async () => {
    assert.equal((await count({ cash: 100, card: 0, pix: 0 })).status, 200)
    assert.equal((await movement('reinforcement', 20)).status, 201)

    const report = (await api('GET', `/shifts/${shiftId}/report`)).json.data
    assert.equal(report.closing.stale, true)

    const stale = await close()
    assert.equal(stale.status, 409)
    assert.match(stale.json.error, /nova contagem/)

    assert.equal((await count({ cash: 120, card: 0, pix: 0 })).status, 200)
    const { rows } = await query(`SELECT count(*)::int AS total FROM shift_counts WHERE shift_id = $1`, [shiftId])
    assert.equal(rows[0].total, 3)
    assert.equal((await close()).status, 200)
  })

  test('turno encerrado não recebe contagem nem novo encerramento (409)', async () => {
    await count({ cash: 100, card: 0, pix: 0 })
    assert.equal((await close()).status, 200)
    assert.equal((await count({ cash: 100, card: 0, pix: 0 })).status, 409)
    assert.equal((await close()).status, 409)
    assert.equal((await api('GET', '/shifts/active', { role: 'cashier' })).json.data, null)
  })
})
