import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'
import { TEST_PASSWORD } from '../support/env.js'

const LOCKED = /^Muitas tentativas\. Tente novamente em (\d+) minutos?\.$/

describe('Limite de tentativas de senha (RN-19)', () => {
  let server
  let staff

  const api = (method, path, { role, token, body } = {}) =>
    server.api(method, path, { token: token ?? (role && staff[role].token), body })
  const login = (email, password) => api('POST', '/auth/login', { body: { email, password } })
  const auditLogs = async (action) =>
    (await query(`SELECT * FROM audit_logs WHERE action = $1 ORDER BY id`, [action])).rows
  // Simula a passagem do tempo: a janela e o bloqueio da chave vencem.
  const expire = (scope, key) =>
    query(
      `UPDATE auth_throttles SET window_started_at = now() - interval '16 minutes',
         locked_until = CASE WHEN locked_until IS NULL THEN NULL ELSE now() - interval '1 minute' END
       WHERE scope = $1 AND key = $2`,
      [scope, key]
    )

  before(async () => {
    await setupSchema()
    server = await startServer()
  })
  after(() => server.close())
  beforeEach(async () => {
    await resetDb()
    staff = await createStaff()
  })

  test('login: 5 senhas erradas bloqueiam; a 6ª dá 429 mesmo com a senha certa; vencido, volta a entrar', async () => {
    for (let i = 1; i <= 5; i++) {
      assert.equal((await login(staff.waiter.email, 'errada')).status, 401, `tentativa ${i}`)
    }
    const locked = await login(` ${staff.waiter.email.toUpperCase()} `, TEST_PASSWORD)
    assert.equal(locked.status, 429)
    assert.equal(locked.json.code, 'TOO_MANY_ATTEMPTS')
    assert.equal(locked.json.error, 'Muitas tentativas. Tente novamente em 15 minutos.')

    const [log] = await auditLogs('auth.login_locked')
    assert.equal(String(log.user_id), staff.waiter.id)
    assert.equal(log.entity, 'user')
    assert.equal(String(log.entity_id), staff.waiter.id)
    assert.equal((await auditLogs('auth.login_locked')).length, 1)

    // Outro usuário não é afetado.
    assert.equal((await login(staff.kitchen.email, TEST_PASSWORD)).status, 200)

    await expire('login', staff.waiter.email)
    assert.equal((await login(staff.waiter.email, TEST_PASSWORD)).status, 200)
    assert.equal((await query(`SELECT count(*)::int AS n FROM auth_throttles`)).rows[0].n, 0)
  })

  test('login: acerto antes da 5ª falha zera a contagem; janela vencida recomeça do 1', async () => {
    for (let i = 0; i < 4; i++) await login(staff.waiter.email, 'errada')
    assert.equal((await login(staff.waiter.email, TEST_PASSWORD)).status, 200)
    for (let i = 0; i < 4; i++) await login(staff.waiter.email, 'errada')
    assert.equal((await login(staff.waiter.email, TEST_PASSWORD)).status, 200)

    for (let i = 0; i < 4; i++) await login(staff.waiter.email, 'errada')
    await expire('login', staff.waiter.email)
    assert.equal((await login(staff.waiter.email, 'errada')).status, 401)
    const { rows } = await query(`SELECT failures FROM auth_throttles WHERE key = $1`, [staff.waiter.email])
    assert.equal(rows[0].failures, 1)
  })

  test('login: e-mail inexistente bloqueia igual (429) e não audita; campos em branco não contam', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await login('ninguem@mesafacil.com', 'x')).status, 401)
    assert.equal((await login('ninguem@mesafacil.com', 'x')).status, 429)
    assert.equal((await auditLogs('auth.login_locked')).length, 0)

    for (let i = 0; i < 6; i++) assert.equal((await login(staff.waiter.email, '')).status, 400)
    assert.equal((await login(staff.waiter.email, TEST_PASSWORD)).status, 200)
  })

  test('autorização: a chave é o caixa; a 5ª ainda é 403, a 6ª é 429; gerente segue entrando', async () => {
    const tableId = (await createTables(1))[0]
    const menuItemId = await createMenuItem({ name: 'Picanha', price: 89.9 })
    await api('POST', '/shifts', { role: 'manager', body: { openingFloat: 0 } })
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
    const itemId = (await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId } })).json.data.id
    await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'in_kitchen' } })
    const cancel = (password) =>
      api('POST', `/order-items/${itemId}/authorized-cancel`, {
        role: 'cashier',
        body: { reason: 'Erro', approver: { email: staff.manager.email, password } },
      })

    for (let i = 1; i <= 5; i++) assert.equal((await cancel('errada')).status, 403, `tentativa ${i}`)
    const locked = await cancel(TEST_PASSWORD)
    assert.equal(locked.status, 429)
    assert.match(locked.json.error, LOCKED)

    const logs = await auditLogs('auth.approval_locked')
    assert.equal(logs.length, 1)
    assert.equal(String(logs[0].user_id), staff.cashier.id)
    assert.equal(String(logs[0].entity_id), staff.cashier.id)
    assert.deepEqual(logs[0].details, { approverEmail: staff.manager.email })

    // O item não foi cancelado, a sessão do caixa vale e o gerente não ficou bloqueado.
    const { rows } = await query(`SELECT status FROM order_items WHERE id = $1`, [itemId])
    assert.notEqual(rows[0].status, 'canceled')
    assert.equal((await api('GET', '/me', { role: 'cashier' })).status, 200)
    assert.equal((await login(staff.manager.email, TEST_PASSWORD)).status, 200)

    await expire('approval', staff.cashier.id)
    assert.equal((await cancel(TEST_PASSWORD)).status, 200)
  })

  test('troca de senha: 5 senhas atuais erradas → 429; redefinição pelo admin desbloqueia login e troca', async () => {
    const change = (currentPassword) =>
      api('PATCH', '/me/password', { role: 'waiter', body: { currentPassword, newPassword: 'nova-senha-123' } })

    for (let i = 1; i <= 5; i++) assert.equal((await change('errada')).status, 422, `tentativa ${i}`)
    assert.equal((await change(TEST_PASSWORD)).status, 429)
    const [log] = await auditLogs('auth.password_change_locked')
    assert.equal(String(log.user_id), staff.waiter.id)
    // Senha atual em branco não conta (e é recusada antes de olhar o bloqueio).
    assert.equal((await change('')).status, 422)

    for (let i = 0; i < 5; i++) await login(staff.waiter.email, 'errada')
    assert.equal((await login(staff.waiter.email, TEST_PASSWORD)).status, 429)

    const reset = await api('PUT', `/users/${staff.waiter.id}/password`, { role: 'admin', body: { password: 'redefinida-123' } })
    assert.equal(reset.status, 200)
    assert.equal((await query(`SELECT count(*)::int AS n FROM auth_throttles`)).rows[0].n, 0)
    const relogin = await login(staff.waiter.email, 'redefinida-123')
    assert.equal(relogin.status, 200)
    const changed = await api('PATCH', '/me/password', {
      token: relogin.json.data.token,
      body: { currentPassword: 'redefinida-123', newPassword: 'nova-senha-123' },
    })
    assert.equal(changed.status, 200)
  })

  test('concorrência: 10 tentativas simultâneas erradas não perdem contagem', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => login(staff.waiter.email, 'errada')))
    for (const { status } of results) assert.ok([401, 429].includes(status), String(status))
    const { rows } = await query(`SELECT failures, locked_until FROM auth_throttles WHERE key = $1`, [staff.waiter.email])
    // Quem passou da checagem antes do bloqueio somou uma falha; o bloqueio ficou ativo e auditado uma vez.
    assert.equal(rows[0].failures, results.filter(({ status }) => status === 401).length)
    assert.ok(rows[0].locked_until)
    assert.equal((await auditLogs('auth.login_locked')).length, 1)
    assert.equal((await login(staff.waiter.email, TEST_PASSWORD)).status, 429)
  })
})
