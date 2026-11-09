import './helpers.js'
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { authenticateToken, requireRole } from '../src/middlewares/authMiddleware.js'
import { ForbiddenError, UnauthorizedError } from '../src/errors/AppError.js'

const secret = process.env.JWT_SECRET
const user = { id: '1', name: 'Carlos', email: 'garcom@mesafacil.com', role: 'waiter' }

function run(mw, req) {
  let received
  mw(req, {}, (err) => (received = err))
  return received
}

describe('authenticateToken', () => {
  test('sem header Authorization → 401', () => {
    assert.ok(run(authenticateToken, { headers: {} }) instanceof UnauthorizedError)
  })

  test('esquema diferente de Bearer → 401', () => {
    const req = { headers: { authorization: 'Basic abc' } }
    assert.ok(run(authenticateToken, req) instanceof UnauthorizedError)
  })

  test('token malformado → 401', () => {
    const req = { headers: { authorization: 'Bearer lixo' } }
    assert.ok(run(authenticateToken, req) instanceof UnauthorizedError)
  })

  test('token assinado com outro segredo → 401', () => {
    const token = jwt.sign(user, 'outro-segredo')
    const req = { headers: { authorization: `Bearer ${token}` } }
    assert.ok(run(authenticateToken, req) instanceof UnauthorizedError)
  })

  test('token expirado → 401', () => {
    const token = jwt.sign(user, secret, { expiresIn: -10 })
    const req = { headers: { authorization: `Bearer ${token}` } }
    assert.ok(run(authenticateToken, req) instanceof UnauthorizedError)
  })

  test('token válido preenche req.user e chama next sem erro', () => {
    const token = jwt.sign(user, secret)
    const req = { headers: { authorization: `Bearer ${token}` } }
    assert.equal(run(authenticateToken, req), undefined)
    assert.deepEqual(req.user, user)
  })
})

describe('requireRole', () => {
  test('sem req.user → 401', () => {
    assert.ok(run(requireRole('manager'), {}) instanceof UnauthorizedError)
  })

  test('papel não permitido → 403', () => {
    const err = run(requireRole('manager'), { user })
    assert.ok(err instanceof ForbiddenError)
    assert.equal(err.statusCode, 403)
  })

  test('papel permitido → segue sem erro', () => {
    assert.equal(run(requireRole('manager', 'waiter'), { user }), undefined)
  })
})