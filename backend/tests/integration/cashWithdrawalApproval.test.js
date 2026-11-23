import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createUser } from '../support/factories.js'
import { startServer } from '../support/server.js'
import { TEST_PASSWORD } from '../support/env.js'

const LIMIT_MESSAGE = 'Sangria acima de R$ 200,00 exige a autorização do gerente.'
const INVALID = 'Autorização recusada: e-mail ou senha do gerente incorretos, ou o usuário não é um gerente ativo.'

describe('Sangria do caixa com limite e autorização do gerente (RN-18)', () => {
  let server
  let staff
  let shiftId

  const api = (method, path, { role = 'manager', body } = {}) =>
    server.api(method, path, { token: role && staff[role].token, body })
  const approver = (role = 'manager', password = TEST_PASSWORD) => ({ email: staff[role].email, password })
  const withdraw = (amount, { role = 'cashier', approver: credentials, reason = 'Cofre' } = {}) =>
    api('POST', `/shifts/${shiftId}/cash-movements`, {
      role,
      body: { type: 'withdrawal', amount, reason, ...(credentials !== undefined && { approver: credentials }) },
    })
  const expected = async () => (await api('GET', `/shifts/${shiftId}/report`)).json.data.cash.expected
  const withdrawals = async () =>
    (await query(`SELECT amount::float AS amount, approved_by::text FROM cash_movements WHERE type = 'withdrawal' ORDER BY id`)).rows

  before(async () => {
    await setupSchema()
    server = await startServer()
  })
  after(() => server.close())
  beforeEach(async () => {
    await resetDb()
    staff = await createStaff()
    shiftId = (await api('POST', '/shifts', { body: { openingFloat: 50 } })).json.data.id
  })

  test('limite público em /shifts/active', async () => {
    const active = (await api('GET', '/shifts/active', { role: 'cashier' })).json.data
    assert.equal(active.withdrawalApprovalLimit, 200)
  })

  test('sondagem: sangrias do caixa até o limite sempre entram, mesmo sem saldo, e não revelam o esperado', async () => {
    // Fundo 50: a partir da 6ª sangria de 10 a gaveta "fica negativa", e a resposta é a mesma.
    const responses = []
    for (let amount = 10; amount <= 200; amount += 10) responses.push(await withdraw(10))
    for (const res of responses) {
      assert.equal(res.status, 201)
      assert.deepEqual(Object.keys(res.json.data).sort(), ['amount', 'approvedBy', 'createdAt', 'id', 'reason', 'type'])
    }
    assert.equal((await withdraw(200)).status, 201)
    assert.equal(await expected(), 50 - 200 - 200)
    // `approver` numa sangria até o limite é ignorado.
    assert.equal((await withdraw(5, { approver: approver('manager', 'errada') })).status, 201)
    assert.ok((await withdrawals()).every((row) => row.approved_by === null))
  })

  test('acima do limite: sem autorização → 422 com o limite; inválida → 403 sem derrubar a sessão', async () => {
    for (const credentials of [undefined, null]) {
      const res = await withdraw(200.01, { approver: credentials })
      assert.equal(res.status, 422)
      assert.equal(res.json.error, LIMIT_MESSAGE)
    }
    assert.equal((await withdraw(250, { approver: { email: '', password: '' } })).status, 422)
    // Validação básica vem antes da autorização.
    assert.equal((await withdraw(250, { approver: approver(), reason: ' ' })).status, 422)

    const inactive = await createUser('manager', { name: 'Gerente antigo', email: 'antigo@mesafacil.com' })
    await query(`UPDATE users SET active = false WHERE id = $1`, [inactive.id])
    for (const credentials of [
      approver('manager', 'errada'),
      { email: inactive.email, password: TEST_PASSWORD },
      approver('waiter'),
      approver('cashier'),
    ]) {
      const res = await withdraw(250, { approver: credentials })
      assert.equal(res.status, 403, JSON.stringify(credentials))
      assert.equal(res.json.error, INVALID)
    }
    assert.equal((await withdrawals()).length, 0)
    assert.equal((await api('GET', '/me', { role: 'cashier' })).status, 200)

    // Autorização vem antes do 404 do turno.
    const missing = await api('POST', '/shifts/999999/cash-movements', {
      role: 'cashier',
      body: { type: 'withdrawal', amount: 250, reason: 'Cofre', approver: approver('manager', 'x') },
    })
    assert.equal(missing.status, 403)
  })

  test('autorizada: grava approved_by e approvedBy na auditoria; acima do esperado → 422 sem gravar', async () => {
    await api('POST', `/shifts/${shiftId}/cash-movements`, {
      body: { type: 'reinforcement', amount: 300, reason: 'Troco do banco' },
    })
    // Esperado 350: autorizada acima dele é recusada (RN-13 volta a valer com o gerente presente).
    const tooMuch = await withdraw(350.01, { approver: approver() })
    assert.equal(tooMuch.status, 422)
    assert.equal(tooMuch.json.error, 'A sangria é maior que o dinheiro disponível na gaveta.')
    assert.equal((await withdrawals()).length, 0)

    const res = await withdraw(300, { approver: { email: ` ${staff.manager.email.toUpperCase()} `, password: TEST_PASSWORD } })
    assert.equal(res.status, 201)
    assert.deepEqual(res.json.data.approvedBy, { id: staff.manager.id, name: staff.manager.name })
    assert.equal('expectedCash' in res.json.data, false)
    assert.deepEqual(await withdrawals(), [{ amount: 300, approved_by: staff.manager.id }])

    const { rows } = await query(`SELECT user_id::text, details FROM audit_logs WHERE action = 'cash.withdrawal'`)
    assert.equal(rows[0].user_id, staff.cashier.id)
    assert.deepEqual(rows[0].details, {
      amount: 300,
      reason: 'Cofre',
      approvedBy: { id: staff.manager.id, name: staff.manager.name },
    })

    const list = (await api('GET', `/shifts/${shiftId}/cash-movements`, { role: 'cashier' })).json.data
    assert.equal(list.find((m) => m.type === 'withdrawal').approvedBy, staff.manager.name)
    const report = (await api('GET', `/shifts/${shiftId}/report`)).json.data
    assert.equal(report.cash.movements.find((m) => m.type === 'withdrawal').approvedBy, staff.manager.name)

    // Admin também autoriza.
    assert.equal((await withdraw(10.5, { approver: approver('admin') })).status, 201)
  })

  test('gerente e admin: sem limite, com a checagem da RN-13 e expectedCash; approver é ignorado', async () => {
    await api('POST', `/shifts/${shiftId}/cash-movements`, {
      body: { type: 'reinforcement', amount: 500, reason: 'Troco do banco' },
    })
    const res = await withdraw(450, { role: 'manager', approver: approver('manager', 'errada') })
    assert.equal(res.status, 201)
    assert.equal(res.json.data.expectedCash, 100)
    assert.equal(res.json.data.approvedBy, null)
    assert.equal((await withdraw(100.01, { role: 'admin' })).status, 422)
  })

  test('reforço não tem limite nem autorização; approved_by em reforço é barrado pelo banco', async () => {
    const res = await api('POST', `/shifts/${shiftId}/cash-movements`, {
      role: 'cashier',
      body: { type: 'reinforcement', amount: 5000, reason: 'Troco', approver: approver('manager', 'errada') },
    })
    assert.equal(res.status, 201)
    assert.equal(res.json.data.approvedBy, null)
    await assert.rejects(
      query(
        `INSERT INTO cash_movements (shift_id, user_id, type, amount, reason, approved_by)
         VALUES ($1, $2, 'reinforcement', 1, 'x', $2)`,
        [shiftId, staff.manager.id],
      ),
      /cash_movements_approval_check/,
    )
  })

  test('autorizações inválidas na sangria entram no limite de tentativas (RN-19)', async () => {
    for (let i = 1; i <= 5; i++) assert.equal((await withdraw(250, { approver: approver('manager', 'errada') })).status, 403)
    const locked = await withdraw(250, { approver: approver() })
    assert.equal(locked.status, 429)
    assert.equal(locked.json.code, 'TOO_MANY_ATTEMPTS')
    // Sangria até o limite não depende de autorização e segue funcionando.
    assert.equal((await withdraw(20)).status, 201)
  })
})
