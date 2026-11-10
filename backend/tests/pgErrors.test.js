import './helpers.js'
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { isPgError, translatePgError } from '../src/errors/pgErrors.js'
import { errorMiddleware } from '../src/middlewares/errorMiddleware.js'

const pgError = (code, extra = {}) => Object.assign(new Error('detalhe interno do banco'), { code, ...extra })

describe('translatePgError', () => {
  const casos = [
    ['23505 unique_violation', pgError('23505'), 409],
    ['23503 FK: referência inexistente', pgError('23503', { detail: 'Key (table_id)=(99) is not present in table "tables".' }), 422],
    ['23503 FK: registro ainda referenciado', pgError('23503', { detail: 'Key (id)=(1) is still referenced from table "orders".' }), 409],
    ['23514 check_violation', pgError('23514'), 422],
    ['23502 not_null_violation', pgError('23502'), 422],
    ['22P02 id/valor malformado', pgError('22P02'), 400],
  ]
  for (const [nome, erro, status] of casos) {
    test(`${nome} → ${status}`, () => {
      const traduzido = translatePgError(erro)
      assert.equal(traduzido.statusCode, status)
      assert.equal(traduzido.message.includes('banco'), false, 'não vaza a mensagem original')
    })
  }

  test('erro desconhecido, sem code ou nulo → null', () => {
    assert.equal(translatePgError(pgError('42P01')), null)
    assert.equal(translatePgError(new Error('x')), null)
    assert.equal(translatePgError(null), null)
  })
})

describe('isPgError', () => {
  test('confere SQLSTATE e, se informada, a constraint', () => {
    const erro = pgError('23505', { constraint: 'shifts_only_one_open_idx' })
    assert.equal(isPgError(erro, '23505'), true)
    assert.equal(isPgError(erro, '23505', 'shifts_only_one_open_idx'), true)
    assert.equal(isPgError(erro, '23505', 'outra_constraint'), false)
    assert.equal(isPgError(erro, '23503'), false)
    assert.equal(isPgError(undefined, '23505'), false)
  })
})

describe('errorMiddleware com erros do banco', () => {
  function run(error) {
    const res = {
      headersSent: false,
      status(code) { this.code = code; return this },
      json(body) { this.body = body; return this },
    }
    errorMiddleware(error, {}, res, () => {})
    return res
  }

  test('erro do pg é traduzido para o status e o formato padrão', () => {
    const res = run(pgError('23505', { constraint: 'x' }))
    assert.equal(res.code, 409)
    assert.equal(res.body.success, false)
    assert.equal(typeof res.body.error, 'string')
    assert.equal(res.body.code, 'CONFLICT')
  })

  test('erro não mapeado continua 500 genérico', () => {
    const original = console.error
    console.error = () => {}
    const res = run(pgError('42P01'))
    console.error = original
    assert.equal(res.code, 500)
    assert.equal(res.body.success, false)
    assert.equal(typeof res.body.error, 'string')
    assert.equal(res.body.code, 'INTERNAL_ERROR')
  })
})