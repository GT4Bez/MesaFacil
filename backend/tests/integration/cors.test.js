import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startServer } from '../support/server.js'

// Nenhum cenário chega ao banco: o preflight e o corpo vazio/inválido são resolvidos antes da query.
describe('CORS', () => {
  let server

  before(async () => {
    server = await startServer()
  })
  after(() => server.close())

  test('preflight de origem permitida libera POST com Authorization e Content-Type', async () => {
    const res = await server.api('OPTIONS', '/auth/login', {
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
    const res = await server.api('POST', '/auth/login', { body: {}, headers: { Origin: 'http://127.0.0.1:5173' } })
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173')
  })

  test('origem não listada não recebe Access-Control-Allow-Origin', async () => {
    const res = await server.api('POST', '/auth/login', { body: {}, headers: { Origin: 'http://malicioso.example' } })
    assert.equal(res.headers.get('access-control-allow-origin'), null)
  })

  test('JSON malformado no corpo → 400 (e não 500)', async () => {
    const res = await server.api('POST', '/auth/login', { body: '{email:' })
    assert.equal(res.status, 400)
    assert.equal(typeof res.json.error, 'string')
    assert.equal(res.json.code, 'BAD_REQUEST')
  })
})
