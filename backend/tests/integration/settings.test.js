import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'

describe('Limite de itens por lançamento e configurações (RN-21, spec 022)', () => {
  let server
  let staff
  let tableIds
  let picanha

  const api = (method, path, { role = 'manager', body } = {}) =>
    server.api(method, path, { token: role && staff[role].token, body })
  const launch = (orderId, quantity, role = 'waiter') =>
    api('POST', `/orders/${orderId}/items`, { role, body: { menuItemId: picanha, quantity } })
  const setLimit = (value, role = 'admin') =>
    api('PATCH', '/settings', { role, body: { maxItemQuantityPerLaunch: value } })
  const limitMessage = (max) =>
    `Cada lançamento do garçom pode ter no máximo ${max} unidades do mesmo item. Para mais, faça outro lançamento ou peça ao gerente.`

  before(async () => {
    await setupSchema()
    server = await startServer()
  })
  after(() => server.close())
  beforeEach(async () => {
    await resetDb()
    staff = await createStaff()
    tableIds = await createTables(1)
    await api('POST', '/shifts', { body: { openingFloat: 0 } })
    picanha = await createMenuItem({ name: 'Picanha na chapa', price: 89.9 })
  })

  test('sem a linha no banco, vale o padrão 10 (qualquer papel lê)', async () => {
    const res = await api('GET', '/settings', { role: 'waiter' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.json.data, { maxItemQuantityPerLaunch: 10, updatedAt: null, updatedBy: null })
  })

  test('garçom: até 10 passa, 11 → 422; gerente e admin sem limite; edição de pendente sem teto', async () => {
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId: tableIds[0] } })).json.data.id
    assert.equal((await launch(orderId, 10)).status, 201)
    const tooMany = await launch(orderId, 11)
    assert.equal(tooMany.status, 422)
    assert.equal(tooMany.json.code, 'VALIDATION_ERROR')
    assert.equal(tooMany.json.error, limitMessage(10))

    assert.equal((await launch(orderId, 11, 'manager')).status, 201)
    assert.equal((await launch(orderId, 40, 'admin')).status, 201)

    // RN-21 vale só no lançamento: o garçom ainda edita a quantidade do pendente acima do limite.
    const itemId = (await launch(orderId, 2)).json.data.id
    assert.equal((await api('PATCH', `/order-items/${itemId}/quantity`, { role: 'waiter', body: { quantity: 25 } })).status, 200)
  })

  test('admin muda o limite; vale na hora; auditoria com from/to e quem alterou', async () => {
    const res = await setLimit(15)
    assert.equal(res.status, 200)
    assert.equal(res.json.data.maxItemQuantityPerLaunch, 15)
    assert.equal(res.json.data.updatedBy, 'Administrador')
    assert.ok(res.json.data.updatedAt)

    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId: tableIds[0] } })).json.data.id
    assert.equal((await launch(orderId, 15)).status, 201)
    assert.equal((await launch(orderId, 16)).json.error, limitMessage(15))

    await setLimit(3)
    assert.equal((await launch(orderId, 4)).json.error, limitMessage(3))
    // Mesmo valor de novo não gera auditoria.
    await setLimit(3)

    const entries = (await api('GET', '/audit-logs?category=settings')).json.data.entries
    assert.deepEqual(
      entries.map((entry) => entry.details),
      [
        { key: 'max_item_quantity_per_launch', from: 15, to: 3 },
        { key: 'max_item_quantity_per_launch', from: 10, to: 15 },
      ],
    )
    assert.deepEqual(entries[0].user, { id: staff.admin.id, name: 'Administrador', role: 'admin' })
    assert.equal(entries[0].entity, 'setting')
  })

  test('só o admin altera; validação 1–99 inteiro; corpo sem campo conhecido → 422', async () => {
    for (const role of ['waiter', 'cashier', 'kitchen', 'manager']) {
      const res = await setLimit(5, role)
      assert.equal(res.status, 403, role)
    }
    assert.equal((await server.api('PATCH', '/settings', { body: { maxItemQuantityPerLaunch: 5 } })).status, 401)
    assert.equal((await server.api('GET', '/settings')).status, 401)

    for (const value of [0, 100, 2.5, '5', null]) {
      const res = await setLimit(value)
      assert.equal(res.status, 422, String(value))
      assert.equal(res.json.error, 'O máximo de unidades iguais por lançamento deve ser um número inteiro de 1 a 99.')
    }
    const empty = await api('PATCH', '/settings', { role: 'admin', body: { outra: 1 } })
    assert.equal(empty.status, 422)
    assert.equal(empty.json.error, 'Informe ao menos uma configuração: maxItemQuantityPerLaunch.')

    const { rows } = await query(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'setting.updated'`)
    assert.equal(rows[0].n, 0)
  })
})
