import './helpers.js'
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseConnection } from '../src/database/DatabaseConnection.js'

DatabaseConnection.instance = { async query() { return { rows: [] } }, async close() {} }
const { default: app } = await import('../src/app.js')

let server
let base

describe('CORS', () => {
  // Hooks dentro do describe: no Node 18 os hooks no nível do arquivo não são executados.
  before(async () => {
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    base = `http://127.0.0.1:${server.address().port}`
  })
  after(() => server.close())

  test('preflight de origem permitida libera POST com Authorization e Content-Type', async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization',
      },
    })
    assert.equal(res.status, 204)
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173')
    assert.match(res.headers.get('access-control-allow-headers'), /authorization/i)
  })

  test('aceita todas as origens listadas em CORS_ORIGIN', async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173')
  })

  test('origem não listada não recebe Access-Control-Allow-Origin', async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { Origin: 'http://malicioso.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(res.headers.get('access-control-allow-origin'), null)
  })

  test('JSON malformado no corpo → 400 (e não 500)', async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{email:',
    })
    assert.equal(res.status, 400)
    const json = await res.json()
    assert.equal(typeof json.error, 'string')
    assert.equal(json.code, 'BAD_REQUEST')
  })
})