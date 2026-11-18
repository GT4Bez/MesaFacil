import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb } from '../support/db.js'
import { createUser } from '../support/factories.js'
import { startServer } from '../support/server.js'

describe('POST /auth/login', () => {
  let server

  before(async () => {
    await setupSchema()
    server = await startServer()
  })
  after(() => server.close())
  beforeEach(async () => {
    await resetDb()
    await createUser('waiter')
  })

  const login = (body) => server.api('POST', '/auth/login', { body })

  test('200 com { success, data: { token, user } }, sem expor a senha', async () => {
    const res = await login({ email: 'garcom@mesafacil.com', password: '123' })
    assert.equal(res.status, 200)
    assert.equal(res.json.success, true)
    assert.equal(typeof res.json.data.token, 'string')
    assert.equal(res.json.data.user.role, 'waiter')
    assert.equal(JSON.stringify(res.json).includes('password'), false)
  })

  test('400 quando faltam campos', async () => {
    const res = await login({ email: 'garcom@mesafacil.com' })
    assert.equal(res.status, 400)
    assert.equal(res.json.success, false)
  })

  test('401 para senha errada e para e-mail inexistente', async () => {
    for (const body of [
      { email: 'garcom@mesafacil.com', password: 'errada' },
      { email: 'x@mesafacil.com', password: '123' },
    ]) {
      const res = await login(body)
      assert.equal(res.status, 401)
      assert.equal(res.json.success, false)
    }
  })

  // Contrato da Sprint 1 (docs/SPRINT_1.md §3): "error" é uma STRING.
  test('contrato: campo error é string', async () => {
    const res = await login({ email: 'garcom@mesafacil.com', password: 'errada' })
    assert.equal(typeof res.json.error, 'string')
    assert.equal(res.json.error.includes('inválidos'), true)
    assert.equal(res.json.code, 'UNAUTHORIZED')
  })
})
