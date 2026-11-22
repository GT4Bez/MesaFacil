import '../support/env.js'
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { AuthService } from '../../src/services/AuthService.js'
import {
  BadRequestError,
  DomainValidationError,
  ForbiddenError,
  UnauthorizedError,
} from '../../src/errors/AppError.js'

const passwordHash = await bcrypt.hash('123', 4)
const dbUser = {
  id: 7n,
  name: 'Mariana Gerente',
  email: 'gerente@mesafacil.com',
  password_hash: passwordHash,
  role: 'manager',
  active: true,
  token_version: 3,
}

function makeService(user = dbUser) {
  const calls = []
  const repo = {
    async findByEmail(email) {
      calls.push(email)
      return email === user?.email ? user : null
    },
  }
  return { service: new AuthService(repo), calls }
}

describe('AuthService.login', () => {
  test('credenciais válidas retornam token e usuário sem password_hash', async () => {
    const { service } = makeService()
    const result = await service.login({ email: 'gerente@mesafacil.com', password: '123' })

    assert.deepEqual(result.user, {
      id: '7',
      name: 'Mariana Gerente',
      email: 'gerente@mesafacil.com',
      role: 'manager',
    })
    assert.equal('password_hash' in result.user, false)

    const payload = jwt.verify(result.token, process.env.JWT_SECRET)
    assert.equal(payload.role, 'manager')
    assert.equal(payload.id, '7')
    assert.equal(payload.tokenVersion, 3)
    assert.ok(payload.exp > payload.iat)
  })

  test('usuário desativado → mesmo 401 da credencial inválida (RN-16)', async () => {
    const { service } = makeService({ ...dbUser, active: false })
    const error = await service.login({ email: 'gerente@mesafacil.com', password: '123' }).catch((e) => e)
    assert.ok(error instanceof UnauthorizedError)
    assert.equal(error.message, 'E-mail ou senha inválidos.')
  })

  test('normaliza o e-mail (trim + minúsculas) antes de consultar o banco', async () => {
    const { service, calls } = makeService()
    await service.login({ email: '  GERENTE@MesaFacil.com ', password: '123' })
    assert.deepEqual(calls, ['gerente@mesafacil.com'])
  })

  test('senha incorreta → UnauthorizedError', async () => {
    const { service } = makeService()
    await assert.rejects(
      service.login({ email: 'gerente@mesafacil.com', password: 'errada' }),
      UnauthorizedError,
    )
  })

  test('usuário inexistente → mesmo erro da senha incorreta (não vaza qual campo falhou)', async () => {
    const { service } = makeService()
    const wrongUser = await service
      .login({ email: 'ninguem@mesafacil.com', password: '123' })
      .catch((e) => e)
    const wrongPass = await service
      .login({ email: 'gerente@mesafacil.com', password: 'x' })
      .catch((e) => e)
    assert.ok(wrongUser instanceof UnauthorizedError)
    assert.equal(wrongUser.message, wrongPass.message)
  })

  for (const [nome, body] of [
    ['sem corpo', undefined],
    ['sem e-mail', { password: '123' }],
    ['sem senha', { email: 'a@b.com' }],
    ['e-mail vazio/espaços', { email: '   ', password: '123' }],
    ['senha vazia', { email: 'a@b.com', password: '' }],
    ['e-mail não-string', { email: { $ne: null }, password: '123' }],
    ['senha não-string', { email: 'a@b.com', password: 123 }],
  ]) {
    test(`campos inválidos (${nome}) → BadRequestError`, async () => {
      const { service, calls } = makeService()
      await assert.rejects(service.login(body), BadRequestError)
      assert.equal(calls.length, 0, 'não deve consultar o banco com entrada inválida')
    })
  }
})

describe('AuthService.verifyApprover (RN-17)', () => {
  test('gerente ativo com senha certa autoriza; e-mail é normalizado', async () => {
    const { service, calls } = makeService()
    const approved = await service.verifyApprover({ email: '  GERENTE@mesafacil.com ', password: '123' })
    assert.deepEqual(approved, { id: '7', name: 'Mariana Gerente' })
    assert.deepEqual(calls, ['gerente@mesafacil.com'])
  })

  test('campos ausentes → 422; qualquer outra falha → 403 com a mesma mensagem', async () => {
    await assert.rejects(makeService().service.verifyApprover({}), DomainValidationError)
    await assert.rejects(makeService().service.verifyApprover({ email: 'a@b.c', password: '' }), DomainValidationError)

    const failures = [
      [dbUser, { email: dbUser.email, password: 'errada' }],
      [{ ...dbUser, active: false }, { email: dbUser.email, password: '123' }],
      [{ ...dbUser, role: 'cashier' }, { email: dbUser.email, password: '123' }],
      [null, { email: dbUser.email, password: '123' }],
    ]
    for (const [user, credentials] of failures) {
      await assert.rejects(makeService(user).service.verifyApprover(credentials), (error) => {
        assert.ok(error instanceof ForbiddenError)
        assert.equal(error.message, 'Autorização do gerente inválida.')
        return true
      })
    }
  })

  test('admin também autoriza', async () => {
    const { service } = makeService({ ...dbUser, role: 'admin' })
    assert.equal((await service.verifyApprover({ email: dbUser.email, password: '123' })).id, '7')
  })
})
