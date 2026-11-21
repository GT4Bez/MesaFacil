import '../support/env.js'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { hasRole, ROLES } from '../../src/auth/roles.js'

describe('auth/roles (RN-16)', () => {
  test('declara os 5 papéis esperados', () => {
    assert.deepEqual(ROLES, ['admin', 'waiter', 'kitchen', 'cashier', 'manager'])
  })

  test('admin passa em qualquer verificação de papel', () => {
    const admin = { role: 'admin' }
    assert.equal(hasRole(admin, 'waiter'), true)
    assert.equal(hasRole(admin, 'manager'), true)
    assert.equal(hasRole(admin), true)
  })

  test('papéis operacionais passam apenas nos papéis explicitamente permitidos', () => {
    assert.equal(hasRole({ role: 'waiter' }, 'waiter', 'manager'), true)
    assert.equal(hasRole({ role: 'waiter' }, 'manager'), false)
    assert.equal(hasRole({ role: 'kitchen' }, 'cashier'), false)
    assert.equal(hasRole(null, 'waiter'), false)
    assert.equal(hasRole(undefined, 'manager'), false)
  })
})
