import './helpers.js'
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcrypt'
import { DatabaseConnection } from '../src/database/DatabaseConnection.js'

// Banco falso injetado no singleton ANTES de importar a app (as rotas instanciam o repositório ao carregar).
const hash = await bcrypt.hash('123', 4)
const rows = {
  'garcom@mesafacil.com': { id: 1n, name: 'Carlos', email: 'garcom@mesafacil.com', password_hash: hash, role: 'waiter' },
}
let failQueries = false
DatabaseConnection.instance = {
  async query(_sql, [email]) {
    if (failQueries) throw new Error('conexão com senha=secreta falhou')
    return { rows: rows[email] ? [rows[email]] : [] }
  },
  async close() {},
}

const { default: app } = await import('../src/app.js')

let server
let base
before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve)
  })
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

const login = (body) =>
  fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /auth/login', () => {
  test('200 com { success, data: { token, user } }', async () => {
    const res = await login({ email: 'garcom@mesafacil.com', password: '123' })
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.success, true)
    assert.equal(typeof json.data.token, 'string')
    assert.equal(json.data.user.role, 'waiter')
    assert.equal(JSON.stringify(json).includes('password'), false)
  })

  test('400 quando faltam campos', async () => {
    const res = await login({ email: 'garcom@mesafacil.com' })
    assert.equal(res.status, 400)
    assert.equal((await res.json()).success, false)
  })

  test('401 para senha errada e para e-mail inexistente', async () => {
    for (const body of [
      { email: 'garcom@mesafacil.com', password: 'errada' },
      { email: 'x@mesafacil.com', password: '123' },
    ]) {
      const res = await login(body)
      assert.equal(res.status, 401)
      assert.equal((await res.json()).success, false)
    }
  })

  test('500 genérico, sem vazar detalhes internos', async () => {
    failQueries = true
    const res = await login({ email: 'garcom@mesafacil.com', password: '123' })
    failQueries = false
    assert.equal(res.status, 500)
    const text = await res.text()
    assert.equal(text.includes('secreta'), false)
  })

  // Contrato da Sprint 1 (docs/SPRINT_1.md §3): "error" é uma STRING.
  test('contrato: campo error é string', async () => {
    const res = await login({ email: 'garcom@mesafacil.com', password: 'errada' })
    const json = await res.json()
    assert.equal(typeof json.error, 'string')
    assert.equal(json.error.includes('inválidos'), true)
    assert.equal(json.code, 'UNAUTHORIZED')
  })
})