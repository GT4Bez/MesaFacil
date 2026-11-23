import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'
import { TEST_PASSWORD } from '../support/env.js'
import { AUDIT_CATEGORIES } from '../../src/domain/auditCategories.js'

describe('Consulta da trilha de auditoria (RN-20, spec 017)', () => {
  let server
  let staff

  const api = (method, path, { role = 'manager', body } = {}) =>
    server.api(method, path, { token: role && staff[role].token, body })
  const logs = (params = '', role = 'manager') => api('GET', `/audit-logs${params}`, { role })
  const actions = (res) => res.json.data.entries.map((entry) => entry.action)

  // Registro direto na trilha, para testar filtros e paginação sem montar cada fluxo.
  async function record(action, { user = staff.manager, shiftId = null, entity = 'shift', entityId = 1, details = {}, at } = {}) {
    const { rows } = await query(
      `INSERT INTO audit_logs (user_id, shift_id, action, entity, entity_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))
       RETURNING id::text`,
      [user.id, shiftId, action, entity, entityId, JSON.stringify(details), at ?? null],
    )
    return rows[0].id
  }

  before(async () => {
    await setupSchema()
    server = await startServer()
  })
  after(() => server.close())
  beforeEach(async () => {
    await resetDb()
    staff = await createStaff()
  })

  test('toda ação do CHECK de audit_logs pertence a exatamente uma categoria', async () => {
    const { rows } = await query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'audit_logs_action_check'`,
    )
    const checked = [...rows[0].def.matchAll(/'([a-z_.]+)'::/g)].map((match) => match[1]).sort()
    const categorized = Object.values(AUDIT_CATEGORIES).flat()
    assert.equal(new Set(categorized).size, categorized.length, 'ação repetida em duas categorias')
    assert.deepEqual([...categorized].sort(), checked)
  })

  test('acesso: sem token 401, garçom/caixa/cozinha 403, gerente e admin 200', async () => {
    assert.equal((await server.api('GET', '/audit-logs')).status, 401)
    assert.equal((await server.api('GET', '/audit-logs/actors')).status, 401)
    for (const role of ['waiter', 'cashier', 'kitchen']) {
      assert.equal((await logs('', role)).status, 403, role)
      assert.equal((await api('GET', '/audit-logs/actors', { role })).status, 403, role)
    }
    for (const role of ['manager', 'admin']) {
      const res = await logs('', role)
      assert.equal(res.status, 200, role)
      assert.deepEqual(res.json.data, { entries: [], nextBefore: null })
    }
  })

  test('visibilidade: as ações user.* só aparecem para o admin, na lista e em actors', async () => {
    await record('shift.opened', { user: staff.manager })
    await record('user.created', { user: staff.admin, entity: 'user', entityId: staff.waiter.id, details: { role: 'waiter' } })
    await record('user.password_changed', { user: staff.waiter, entity: 'user', entityId: staff.waiter.id })

    assert.deepEqual(actions(await logs()), ['shift.opened'])
    assert.deepEqual(actions(await logs('', 'admin')), ['user.password_changed', 'user.created', 'shift.opened'])

    const forbidden = await logs('?category=users')
    assert.equal(forbidden.status, 403)
    assert.equal(forbidden.json.code, 'FORBIDDEN')
    assert.deepEqual(actions(await logs('?category=users', 'admin')), ['user.password_changed', 'user.created'])

    const managerActors = (await api('GET', '/audit-logs/actors')).json.data.actors
    assert.deepEqual(managerActors, [{ id: staff.manager.id, name: 'Gerente', role: 'manager', active: true }])
    const adminActors = (await api('GET', '/audit-logs/actors', { role: 'admin' })).json.data.actors
    assert.deepEqual(adminActors.map((actor) => actor.name), ['Administrador', 'Garçom', 'Gerente'])
  })

  test('filtros por categoria, usuário, turno e período, combinados; to é exclusivo', async () => {
    const { rows } = await query(`INSERT INTO shifts (opened_by) VALUES ($1) RETURNING id::text`, [staff.manager.id])
    const shiftId = rows[0].id
    await record('shift.opened', { shiftId, at: '2026-11-20T10:00:00-03:00' })
    await record('cash.withdrawal', { user: staff.cashier, shiftId, entity: 'cash_movement', at: '2026-11-21T10:00:00-03:00' })
    await record('cash.reinforcement', { user: staff.manager, shiftId, entity: 'cash_movement', at: '2026-11-22T10:00:00-03:00' })
    await record('auth.login_locked', { user: staff.cashier, entity: 'user', entityId: staff.cashier.id, at: '2026-11-22T23:59:59-03:00' })

    assert.deepEqual(actions(await logs('?category=cash')), ['cash.reinforcement', 'cash.withdrawal'])
    assert.deepEqual(actions(await logs(`?userId=${staff.cashier.id}`)), ['auth.login_locked', 'cash.withdrawal'])
    assert.deepEqual(actions(await logs(`?shiftId=${shiftId}`)), ['cash.reinforcement', 'cash.withdrawal', 'shift.opened'])
    assert.deepEqual(actions(await logs(`?category=cash&userId=${staff.cashier.id}`)), ['cash.withdrawal'])

    const day = (from, to) => `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    assert.deepEqual(
      actions(await logs(day('2026-11-21T00:00:00-03:00', '2026-11-22T10:00:00-03:00'))),
      ['cash.withdrawal'],
      'to exclusivo',
    )
    // O mesmo instante em UTC.
    assert.deepEqual(
      actions(await logs(day('2026-11-22T03:00:00Z', '2026-11-23T03:00:00Z'))),
      ['auth.login_locked', 'cash.reinforcement'],
    )
    assert.deepEqual(actions(await logs('?shiftId=999999')), [])
  })

  test('paginação por cursor percorre tudo sem repetir nem pular, mesmo com registro novo entre as páginas', async () => {
    const ids = []
    for (let i = 0; i < 5; i++) ids.push(await record('shift.opened'))

    const seen = []
    let res = await logs('?limit=2')
    seen.push(...res.json.data.entries.map((entry) => entry.id))
    await record('shift.closed') // entra no topo; não pode aparecer nas próximas páginas.
    while (res.json.data.nextBefore) {
      res = await logs(`?limit=2&before=${res.json.data.nextBefore}`)
      seen.push(...res.json.data.entries.map((entry) => entry.id))
    }
    assert.deepEqual(seen, [...ids].reverse())
    assert.equal(res.json.data.nextBefore, null)

    const exact = await logs('?limit=6')
    assert.equal(exact.json.data.entries.length, 6)
    assert.equal(exact.json.data.nextBefore, null)
  })

  test('validação: parâmetros inválidos respondem 422', async () => {
    const invalid = [
      '?limit=0', '?limit=101', '?limit=abc', '?before=0', '?before=x',
      '?category=foo', '?userId=-1', '?shiftId=1.5',
      '?from=2026-11-23', '?from=2026-11-23T00:00:00', '?to=2026-02-30T00:00:00Z', '?from=2026-11-23T25:00:00Z',
      `?from=${encodeURIComponent('2026-11-23T00:00:00-03:00')}&to=${encodeURIComponent('2026-11-23T00:00:00-03:00')}`,
      '?category=cash&category=shift',
    ]
    for (const params of invalid) {
      const res = await logs(params)
      assert.equal(res.status, 422, params)
      assert.equal(res.json.code, 'VALIDATION_ERROR', params)
    }
  })

  test('alvo: cancelamento autorizado, mudança de preço, ajuste de estoque, turno e caixa', async () => {
    const [tableId] = await createTables(1)
    const shiftId = (await api('POST', '/shifts', { body: { openingFloat: 0 } })).json.data.id
    const picanha = await createMenuItem({ name: 'Picanha na chapa', price: 89.9 })

    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
    const itemId = (await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: picanha } })).json.data.id
    await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'in_kitchen' } })
    const canceled = await api('POST', `/order-items/${itemId}/authorized-cancel`, {
      role: 'cashier',
      body: { reason: 'Cliente desistiu', approver: { email: staff.manager.email, password: TEST_PASSWORD } },
    })
    assert.equal(canceled.status, 200)

    assert.equal((await api('PATCH', `/menu-items/${picanha}`, { body: { price: 94.9 } })).status, 200)
    const carne = (await api('POST', '/ingredients', { body: { name: 'Picanha', unit: 'kg', minStock: 1, unitCost: 70 } })).json.data
    await api('POST', `/ingredients/${carne.id}/adjustments`, { body: { countedQuantity: 4.5, reason: 'Inventário' } })
    await api('POST', `/shifts/${shiftId}/cash-movements`, { role: 'cashier', body: { type: 'reinforcement', amount: 50, reason: 'Troco' } })

    const entries = (await logs()).json.data.entries
    const byAction = Object.fromEntries(entries.map((entry) => [entry.action, entry]))

    const cancel = byAction['order_item.canceled']
    assert.deepEqual(cancel.user, { id: staff.cashier.id, name: 'Caixa', role: 'cashier' })
    assert.deepEqual(cancel.target, { orderId, tableNumber: 1, menuItem: 'Picanha na chapa' })
    assert.deepEqual(cancel.details.approvedBy, { id: staff.manager.id, name: 'Gerente' })
    assert.equal(cancel.details.reason, 'Cliente desistiu')
    assert.equal(cancel.shiftId, shiftId)

    assert.deepEqual(byAction['menu_item.price_changed'].target, { name: 'Picanha na chapa' })
    assert.deepEqual(byAction['menu_item.price_changed'].details, { from: 89.9, to: 94.9 })
    assert.deepEqual(byAction['stock.adjusted'].target, { name: 'Picanha', unit: 'kg' })
    assert.equal(byAction['shift.opened'].target, null)
    assert.equal(byAction['cash.reinforcement'].target, null)
    assert.equal(byAction['cash.reinforcement'].entity, 'cash_movement')
    assert.equal(typeof byAction['cash.reinforcement'].entityId, 'string')
  })

  test('alvo de pedido inteiro e de usuário', async () => {
    const [, tableId] = await createTables(2)
    await api('POST', '/shifts', { body: { openingFloat: 0 } })
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { body: { status: 'canceled', reason: 'Mesa errada' } })).status, 200)
    await record('user.updated', { user: staff.admin, entity: 'user', entityId: staff.waiter.id, details: { changes: {} } })

    const entries = (await logs('', 'admin')).json.data.entries
    const order = entries.find((entry) => entry.action === 'order.canceled')
    assert.deepEqual(order.target, { orderId, tableNumber: 2 })
    const user = entries.find((entry) => entry.action === 'user.updated')
    assert.deepEqual(user.target, { name: 'Garçom', role: 'waiter' })
  })
})
