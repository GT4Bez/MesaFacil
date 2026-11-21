import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createUser, tokenFor, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'
import { TEST_PASSWORD } from '../support/env.js'

describe('Usuários e superadmin (RN-16)', () => {
  let server
  let staff

  const api = (method, path, { role = 'admin', token, body } = {}) =>
    server.api(method, path, { token: token ?? (role && staff[role].token), body })
  const login = (email, password = TEST_PASSWORD) =>
    server.api('POST', '/auth/login', { body: { email, password } })
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
  })

  test('só o admin administra usuários; gerente e demais → 403', async () => {
    for (const role of ['manager', 'waiter', 'kitchen', 'cashier']) {
      assert.equal((await api('GET', '/users', { role })).status, 403, role)
      assert.equal((await api('POST', '/users', { role, body: {} })).status, 403, role)
    }
    assert.equal((await api('GET', '/users', { role: null })).status, 401)

    const list = await api('GET', '/users')
    assert.equal(list.status, 200)
    assert.deepEqual(
      list.json.data.map((user) => user.name),
      ['Administrador', 'Caixa', 'Cozinha', 'Garçom', 'Gerente'],
    )
    assert.equal(JSON.stringify(list.json).includes('password'), false)

    const waiters = await api('GET', '/users?role=waiter&active=true')
    assert.deepEqual(waiters.json.data.map((user) => user.role), ['waiter'])
    assert.equal((await api('GET', '/users?role=chef')).status, 422)
    assert.equal((await api('GET', '/users?active=talvez')).status, 422)
  })

  test('criar usuário: valida, normaliza e-mail, 409 para repetido e grava auditoria', async () => {
    const create = (body) => api('POST', '/users', { body })
    const valid = { name: '  Ana  ', email: '  Ana@MesaFacil.com ', role: 'waiter', password: 'senha-forte' }

    assert.equal((await create({ ...valid, password: '1234567' })).status, 422)
    assert.equal((await create({ ...valid, password: 'x'.repeat(73) })).status, 422)
    assert.equal((await create({ ...valid, email: 'sem-arroba' })).status, 422)
    assert.equal((await create({ ...valid, role: 'chef' })).status, 422)
    assert.equal((await create({ ...valid, name: '' })).status, 422)

    const created = await create(valid)
    assert.equal(created.status, 201)
    assert.equal(created.json.data.name, 'Ana')
    assert.equal(created.json.data.email, 'ana@mesafacil.com')
    assert.equal(created.json.data.active, true)
    assert.equal('password_hash' in created.json.data, false)

    const duplicated = await create({ ...valid, email: 'ANA@mesafacil.com' })
    assert.equal(duplicated.status, 409)

    assert.equal((await login('ana@mesafacil.com', 'senha-forte')).status, 200)

    const [log] = await auditLogs('user.created')
    assert.equal(String(log.user_id), staff.admin.id)
    assert.equal(String(log.entity_id), created.json.data.id)
    assert.deepEqual(log.details, { role: 'waiter' })
  })

  test('desativar revoga o token na hora e bloqueia o login; reativar devolve o acesso', async () => {
    const waiter = staff.waiter
    assert.equal((await api('GET', '/me', { role: 'waiter' })).status, 200)

    const deactivated = await api('PATCH', `/users/${waiter.id}`, { body: { active: false } })
    assert.equal(deactivated.status, 200)
    assert.equal(deactivated.json.data.active, false)

    assert.equal((await api('GET', '/tables', { role: 'waiter' })).status, 401)
    assert.equal((await login(waiter.email)).status, 401)
    assert.equal((await login(waiter.email)).json.error, 'E-mail ou senha inválidos.')

    await api('PATCH', `/users/${waiter.id}`, { body: { active: true } })
    const relogin = await login(waiter.email)
    assert.equal(relogin.status, 200)
    assert.equal((await api('GET', '/tables', { token: relogin.json.data.token })).status, 200)

    const [log] = await auditLogs('user.updated')
    assert.deepEqual(log.details, { changes: { active: { from: true, to: false } } })
  })

  test('trocar o papel vale na próxima requisição, sem novo login', async () => {
    assert.equal((await api('POST', '/shifts', { role: 'waiter' })).status, 403)
    await api('PATCH', `/users/${staff.waiter.id}`, { body: { role: 'manager' } })
    // Mesmo token de antes: o papel vem do banco.
    assert.equal((await api('POST', '/shifts', { role: 'waiter' })).status, 201)
    const me = await api('GET', '/me', { role: 'waiter' })
    assert.equal(me.json.data.role, 'manager')
  })

  test('nunca fica sem admin ativo; admin não desativa nem rebaixa a si mesmo', async () => {
    const self = (body) => api('PATCH', `/users/${staff.admin.id}`, { body })
    assert.equal((await self({ active: false })).status, 409)
    assert.equal((await self({ role: 'manager' })).status, 409)
    assert.equal((await self({ name: 'Admin Geral' })).status, 200)

    // Com dois admins, um rebaixa o outro; o restante não pode mais ser removido.
    const second = await createUser('admin', { name: 'Admin 2', email: 'admin2@mesafacil.com' })
    const secondToken = tokenFor(second)
    assert.equal((await api('PATCH', `/users/${staff.admin.id}`, { token: secondToken, body: { role: 'manager' } })).status, 200)
    // O primeiro admin foi rebaixado: o token antigo foi revogado.
    assert.equal((await api('GET', '/users')).status, 401)

    const last = await api('PATCH', `/users/${second.id}`, { token: secondToken, body: { active: false } })
    assert.equal(last.status, 409)
    const { rows } = await query(`SELECT count(*)::int AS total FROM users WHERE role = 'admin' AND active`)
    assert.equal(rows[0].total, 1)
  })

  test('dois admins rebaixando um ao outro ao mesmo tempo: um deles fica', async () => {
    const second = await createUser('admin', { name: 'Admin 2', email: 'admin2@mesafacil.com' })
    const [a, b] = await Promise.all([
      api('PATCH', `/users/${second.id}`, { body: { role: 'manager' } }),
      api('PATCH', `/users/${staff.admin.id}`, { token: tokenFor(second), body: { role: 'manager' } }),
    ])
    // Um vence; o outro recebe 409 (trava FOR UPDATE) ou 401 (seu admin já foi rebaixado e o token revogado).
    const statuses = [a.status, b.status].sort()
    assert.equal(statuses[0], 200)
    assert.ok([401, 409].includes(statuses[1]), `status inesperado: ${statuses[1]}`)
    const { rows } = await query(`SELECT count(*)::int AS total FROM users WHERE role = 'admin' AND active`)
    assert.equal(rows[0].total, 1)
  })

  test('PATCH: 404 inexistente, 422 vazio, 409 e-mail de outro usuário', async () => {
    assert.equal((await api('PATCH', '/users/999', { body: { name: 'X' } })).status, 404)
    assert.equal((await api('PATCH', `/users/${staff.waiter.id}`, { body: {} })).status, 422)
    assert.equal((await api('PATCH', `/users/${staff.waiter.id}`, { body: { active: 'sim' } })).status, 422)
    assert.equal(
      (await api('PATCH', `/users/${staff.waiter.id}`, { body: { email: 'GERENTE@mesafacil.com' } })).status,
      409,
    )
  })

  test('admin redefine a senha: token anterior revogado, login com a nova', async () => {
    const reset = (body, id = staff.cashier.id) => api('PUT', `/users/${id}/password`, { body })
    assert.equal((await reset({ password: 'curta' })).status, 422)
    assert.equal((await reset({ password: 'nova-senha-1' }, '999')).status, 404)
    assert.equal((await api('PUT', `/users/${staff.cashier.id}/password`, { role: 'manager', body: { password: 'nova-senha-1' } })).status, 403)

    const res = await reset({ password: 'nova-senha-1' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.json.data, { id: staff.cashier.id })

    assert.equal((await api('GET', '/me', { role: 'cashier' })).status, 401)
    assert.equal((await login(staff.cashier.email)).status, 401)
    assert.equal((await login(staff.cashier.email, 'nova-senha-1')).status, 200)
    assert.equal((await auditLogs('user.password_reset')).length, 1)
  })

  test('/me e troca da própria senha exigindo a senha atual', async () => {
    const me = await api('GET', '/me', { role: 'kitchen' })
    assert.equal(me.status, 200)
    assert.deepEqual(
      { name: me.json.data.name, role: me.json.data.role, active: me.json.data.active },
      { name: 'Cozinha', role: 'kitchen', active: true },
    )

    const change = (body) => api('PATCH', '/me/password', { role: 'kitchen', body })
    assert.equal((await change({ currentPassword: 'errada', newPassword: 'nova-senha-1' })).status, 422)
    assert.equal((await change({ currentPassword: TEST_PASSWORD, newPassword: 'curta' })).status, 422)
    assert.equal((await change({ newPassword: 'nova-senha-1' })).status, 422)

    const ok = await change({ currentPassword: TEST_PASSWORD, newPassword: 'nova-senha-1' })
    assert.equal(ok.status, 200)
    // A troca revoga o token atual: o usuário entra de novo com a senha nova.
    assert.equal((await api('GET', '/me', { role: 'kitchen' })).status, 401)
    assert.equal((await login(staff.kitchen.email, 'nova-senha-1')).status, 200)

    const [log] = await auditLogs('user.password_changed')
    assert.equal(String(log.user_id), staff.kitchen.id)
  })

  test('token sem tokenVersion ou de usuário inexistente → 401', async () => {
    const withoutVersion = jwt.sign({ id: staff.waiter.id, role: 'waiter' }, process.env.JWT_SECRET)
    assert.equal((await api('GET', '/me', { token: withoutVersion })).status, 401)
    assert.equal((await api('GET', '/me', { token: tokenFor(staff.waiter, 2) })).status, 401)
    assert.equal((await api('GET', '/me', { token: tokenFor({ ...staff.waiter, id: '999' }) })).status, 401)
  })

  test('admin executa ações de qualquer papel (abrir turno, cancelar item enviado, pagar)', async () => {
    const [tableId] = await createTables(1)
    const menuItemId = await createMenuItem({ price: 20 })

    assert.equal((await api('POST', '/shifts')).status, 201)
    const orderId = (await api('POST', '/orders', { body: { tableId } })).json.data.id
    const itemId = (await api('POST', `/orders/${orderId}/items`, { body: { menuItemId } })).json.data.id
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { body: { status: 'in_kitchen' } })).status, 200)
    assert.equal((await api('PATCH', `/order-items/${itemId}/status`, { body: { status: 'preparing' } })).status, 200)
    assert.equal((await api('GET', '/kitchen/orders')).status, 200)
    assert.equal((await api('GET', '/menu-items?all=true')).status, 200)
    // Paga antes de cancelar: depois do cancelamento o pedido ficaria quitado (RN-12 → 409).
    assert.equal((await api('POST', `/orders/${orderId}/payments`, { body: { amount: 5, method: 'pix' } })).status, 201)
    assert.equal(
      (await api('PATCH', `/order-items/${itemId}/status`, { body: { status: 'canceled', reason: 'Teste' } })).status,
      200,
    )

    const [log] = await auditLogs('order_item.canceled')
    assert.equal(String(log.user_id), staff.admin.id)
  })
})
