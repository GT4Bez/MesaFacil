import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'

describe('Movimentos de caixa: fundo, sangria e reforço (RN-13)', () => {
  let server
  let staff
  let tableIds
  let picanha

  const api = (method, path, { role = 'manager', body } = {}) =>
    server.api(method, path, { token: role && staff[role].token, body })
  const openShift = (openingFloat, role = 'manager') =>
    api('POST', '/shifts', { role, body: openingFloat === undefined ? {} : { openingFloat } })
  const move = (shiftId, body, role = 'cashier') =>
    api('POST', `/shifts/${shiftId}/cash-movements`, { role, body })
  const withdraw = (shiftId, amount, role = 'cashier', reason = 'Cofre') =>
    move(shiftId, { type: 'withdrawal', amount, reason }, role)

  // Pedido de uma picanha (89,90) pronto para pagar.
  async function orderReadyToPay(tableId) {
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
    const itemId = (await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: picanha } })).json.data.id
    await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'in_kitchen' } })
    await api('PATCH', `/order-items/${itemId}/status`, { role: 'kitchen', body: { status: 'preparing' } })
    await api('PATCH', `/order-items/${itemId}/status`, { role: 'kitchen', body: { status: 'ready' } })
    await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'ready_to_pay' } })
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
    picanha = await createMenuItem({ name: 'Picanha', price: 89.9 })
  })

  test('abrir turno exige fundo válido; 0 é aceito e o fundo é registrado e auditado', async () => {
    for (const openingFloat of [undefined, null, -1, '150', Number.NaN]) {
      const res = await openShift(openingFloat)
      assert.equal(res.status, 422, `openingFloat=${openingFloat}`)
      assert.equal(res.json.code, 'VALIDATION_ERROR')
    }
    assert.equal((await query('SELECT count(*)::int AS n FROM shifts')).rows[0].n, 0)

    const res = await openShift(0)
    assert.equal(res.status, 201)
    assert.equal(res.json.data.openingFloat, 0)
    assert.equal((await openShift(10)).status, 409)

    const movements = (await api('GET', `/shifts/${res.json.data.id}/cash-movements`)).json.data
    assert.equal(movements.length, 1)
    assert.equal(movements[0].type, 'opening_float')
    assert.equal(movements[0].amount, 0)
    assert.equal(movements[0].by, staff.manager.name)

    const { rows } = await query(`SELECT details FROM audit_logs WHERE action = 'shift.opened'`)
    assert.deepEqual(rows[0].details, { openingFloat: 0 })
  })

  test('garçom e cozinha → 403; sem token → 401; turno inexistente → 404; id inválido → 400', async () => {
    const shiftId = (await openShift(100)).json.data.id
    for (const role of ['waiter', 'kitchen']) {
      assert.equal((await withdraw(shiftId, 10, role)).status, 403)
      assert.equal((await api('GET', `/shifts/${shiftId}/cash-movements`, { role })).status, 403)
    }
    assert.equal((await withdraw(shiftId, 10, null)).status, 401)
    assert.equal((await withdraw('999', 10)).status, 404)
    assert.equal((await api('GET', '/shifts/999/cash-movements', { role: 'cashier' })).status, 404)
    assert.equal((await withdraw('abc', 10)).status, 400)
  })

  test('valida tipo, valor e motivo (422)', async () => {
    const shiftId = (await openShift(100)).json.data.id
    const invalid = [
      { type: 'opening_float', amount: 10, reason: 'Outro fundo' },
      { type: 'expense', amount: 10, reason: 'x' },
      { type: 'withdrawal', amount: 0, reason: 'Cofre' },
      { type: 'withdrawal', amount: -5, reason: 'Cofre' },
      { type: 'reinforcement', amount: '10', reason: 'Troco' },
      { type: 'withdrawal', amount: 10 },
      { type: 'reinforcement', amount: 10, reason: '   ' },
    ]
    for (const body of invalid) {
      assert.equal((await move(shiftId, body)).status, 422, JSON.stringify(body))
    }
    assert.equal((await query('SELECT count(*)::int AS n FROM cash_movements')).rows[0].n, 1)
  })

  test('sangria do gerente não passa do dinheiro esperado e o caixa nunca recebe o esperado', async () => {
    const shiftId = (await openShift(100)).json.data.id

    // RN-13 vale para gerente/admin; a do caixa até o limite não é comparada (RN-18, cashWithdrawalApproval.test.js).
    const tooMuch = await withdraw(shiftId, 100.01, 'manager')
    assert.equal(tooMuch.status, 422)
    assert.doesNotMatch(tooMuch.json.error, /100/)

    const byCashier = await withdraw(shiftId, 30)
    assert.equal(byCashier.status, 201)
    assert.equal(byCashier.json.data.type, 'withdrawal')
    assert.equal(byCashier.json.data.amount, 30)
    assert.equal(byCashier.json.data.reason, 'Cofre')
    assert.equal(byCashier.json.data.approvedBy, null)
    assert.equal('expectedCash' in byCashier.json.data, false)

    const reinforcement = await move(shiftId, { type: 'reinforcement', amount: 50, reason: 'Troco do banco' }, 'manager')
    assert.equal(reinforcement.status, 201)
    assert.equal(reinforcement.json.data.expectedCash, 120)

    const byAdmin = await withdraw(shiftId, 120, 'admin')
    assert.equal(byAdmin.status, 201)
    assert.equal(byAdmin.json.data.expectedCash, 0)
    assert.equal((await withdraw(shiftId, 0.01, 'manager')).status, 422)

    const list = (await api('GET', `/shifts/${shiftId}/cash-movements`, { role: 'cashier' })).json.data
    assert.deepEqual(list.map((m) => [m.type, m.amount, m.by, m.approvedBy]), [
      ['opening_float', 100, staff.manager.name, null],
      ['withdrawal', 30, staff.cashier.name, null],
      ['reinforcement', 50, staff.manager.name, null],
      ['withdrawal', 120, staff.admin.name, null],
    ])
    assert.equal(list.some((m) => 'expectedCash' in m), false)
  })

  test('movimentos geram auditoria com shift_id na mesma transação', async () => {
    const shiftId = (await openShift(100)).json.data.id
    const out = (await withdraw(shiftId, 40, 'cashier', 'Cofre da tarde')).json.data
    await move(shiftId, { type: 'reinforcement', amount: 10, reason: 'Moedas' })

    const { rows } = await query(
      `SELECT action, entity, entity_id::text, shift_id::text, user_id::text, details
       FROM audit_logs WHERE action LIKE 'cash.%' ORDER BY id`,
    )
    assert.deepEqual(rows[0], {
      action: 'cash.withdrawal',
      entity: 'cash_movement',
      entity_id: out.id,
      shift_id: shiftId,
      user_id: staff.cashier.id,
      details: { amount: 40, reason: 'Cofre da tarde' },
    })
    assert.equal(rows[1].action, 'cash.reinforcement')
  })

  test('turno encerrado não aceita movimentos (409)', async () => {
    const shiftId = (await openShift(100)).json.data.id
    await api('PUT', `/shifts/${shiftId}/count`, { role: 'cashier', body: { declared: { cash: 100, card: 0, pix: 0 } } })
    assert.equal((await api('PATCH', `/shifts/${shiftId}/close`)).status, 200)
    assert.equal((await withdraw(shiftId, 10)).status, 409)
    assert.equal((await move(shiftId, { type: 'reinforcement', amount: 10, reason: 'Troco' })).status, 409)
    // A lista continua disponível para consulta.
    assert.equal((await api('GET', `/shifts/${shiftId}/cash-movements`, { role: 'cashier' })).status, 200)
  })

  test('duas sangrias simultâneas que juntas passam do esperado: só uma entra', async () => {
    const shiftId = (await openShift(100)).json.data.id
    // Gerente e admin passam pela checagem da RN-13 (a sangria do caixa até o limite não é comparada, RN-18).
    const results = await Promise.all([withdraw(shiftId, 60, 'admin'), withdraw(shiftId, 60, 'manager')])
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 422])
    const { rows } = await query(`SELECT count(*)::int AS n FROM cash_movements WHERE type = 'withdrawal'`)
    assert.equal(rows[0].n, 1)
  })

  test('relatório traz o bloco cash com o esperado líquido de troco', async () => {
    const shiftId = (await openShift(150)).json.data.id

    // Dinheiro com troco: saldo 89,90, recebido 100 → entram 89,90 na gaveta.
    const cashOrder = await orderReadyToPay(tableIds[0])
    assert.equal((await api('POST', `/orders/${cashOrder}/payments`, { role: 'cashier', body: { amount: 100, method: 'cash' } })).json.data.changeAmount, 10.1)
    // Pix não entra na gaveta.
    const pixOrder = await orderReadyToPay(tableIds[1])
    await api('POST', `/orders/${pixOrder}/payments`, { role: 'cashier', body: { amount: 89.9, method: 'pix' } })

    await withdraw(shiftId, 200)
    await move(shiftId, { type: 'reinforcement', amount: 20.5, reason: 'Moedas' })

    const { cash } = (await api('GET', `/shifts/${shiftId}/report`)).json.data
    assert.equal(cash.openingFloat, 150)
    assert.equal(cash.cashPayments, 89.9)
    assert.equal(cash.withdrawals, 200)
    assert.equal(cash.reinforcements, 20.5)
    assert.equal(cash.expected, 60.4)
    assert.deepEqual(cash.movements.map((m) => m.type), ['opening_float', 'withdrawal', 'reinforcement'])

    // Bate com o banco: fundo + dinheiro líquido − sangrias + reforços.
    const { rows } = await query(
      `SELECT
         (SELECT sum(CASE type WHEN 'withdrawal' THEN -amount ELSE amount END) FROM cash_movements WHERE shift_id = $1)
         + (SELECT sum(p.amount - p.change_amount) FROM payments p JOIN orders o ON o.id = p.order_id
            WHERE o.shift_id = $1 AND p.payment_method = 'cash') AS expected`,
      [shiftId],
    )
    assert.equal(Number(rows[0].expected), cash.expected)
  })
})
