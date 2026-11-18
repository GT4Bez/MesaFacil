import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'

describe('Administração do cardápio (spec 002)', () => {
  let server
  let staff

  const api = (method, path, { role = 'manager', body } = {}) =>
    server.api(method, path, { token: role && staff[role].token, body })

  before(async () => {
    await setupSchema()
    server = await startServer()
  })
  after(() => server.close())
  beforeEach(async () => {
    await resetDb()
    staff = await createStaff()
  })

  test('exige autenticação e papel de gerente para criar, editar e listar tudo', async () => {
    const id = await createMenuItem()
    assert.equal((await api('GET', '/menu-items', { role: null })).status, 401)
    assert.equal((await api('GET', '/menu-items/categories', { role: null })).status, 401)
    for (const role of ['waiter', 'kitchen', 'cashier']) {
      assert.equal((await api('GET', '/menu-items?all=true', { role })).status, 403)
      assert.equal((await api('POST', '/menu-items', { role, body: { name: 'X', category: 'Y', price: 1 } })).status, 403)
      assert.equal((await api('PATCH', `/menu-items/${id}`, { role, body: { price: 2 } })).status, 403)
    }
  })

  test('gerente cria item com dados normalizados e disponível por padrão', async () => {
    const res = await api('POST', '/menu-items', {
      body: { name: '  Moqueca  ', category: ' Pratos ', price: 79.899 },
    })
    assert.equal(res.status, 201)
    assert.deepEqual(res.json.data, {
      id: res.json.data.id,
      name: 'Moqueca',
      category: 'Pratos',
      price: 79.9,
      available: true,
    })
  })

  test('valida os campos na criação e na edição (422)', async () => {
    const invalid = [
      {},
      { name: '', category: 'Pratos', price: 10 },
      { name: 'x'.repeat(101), category: 'Pratos', price: 10 },
      { name: 'Prato', category: 'x'.repeat(51), price: 10 },
      { name: 'Prato', category: 'Pratos', price: -1 },
      { name: 'Prato', category: 'Pratos', price: '10' },
      { name: 'Prato', category: 'Pratos', price: 1e9 },
      { name: 'Prato', category: 'Pratos', price: 10, available: 'sim' },
    ]
    for (const body of invalid) {
      assert.equal((await api('POST', '/menu-items', { body })).status, 422, JSON.stringify(body))
    }

    const id = await createMenuItem()
    assert.equal((await api('PATCH', `/menu-items/${id}`, { body: {} })).status, 422)
    assert.equal((await api('PATCH', `/menu-items/${id}`, { body: { name: '   ' } })).status, 422)
    assert.equal((await api('PATCH', '/menu-items/999', { body: { price: 5 } })).status, 404)
  })

  test('desativar tira o item das listagens e dos novos lançamentos; ?all=true mostra todos', async () => {
    const [tableId] = await createTables(1)
    const ativo = await createMenuItem({ name: 'Ativo', category: 'Bebidas' })
    const saiDeLinha = await createMenuItem({ name: 'Sai de linha', category: 'Pratos' })

    const res = await api('PATCH', `/menu-items/${saiDeLinha}`, { body: { available: false } })
    assert.equal(res.status, 200)
    assert.equal(res.json.data.available, false)

    const listed = await api('GET', '/menu-items', { role: 'waiter' })
    assert.deepEqual(listed.json.data.map((item) => item.id), [ativo])
    assert.equal('available' in listed.json.data[0], false)

    const all = await api('GET', '/menu-items?all=true')
    assert.deepEqual(all.json.data.map((item) => [item.name, item.available]), [
      ['Ativo', true],
      ['Sai de linha', false],
    ])

    await api('POST', '/shifts')
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
    const added = await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: saiDeLinha } })
    assert.equal(added.status, 404)

    // Não existe exclusão física.
    assert.equal((await api('DELETE', `/menu-items/${saiDeLinha}`)).status, 404)
    const { rows } = await query('SELECT count(*)::int AS total FROM menu_items')
    assert.equal(rows[0].total, 2)
  })

  test('RN-09: mudar o preço não altera itens já lançados', async () => {
    const [tableId] = await createTables(1)
    const id = await createMenuItem({ name: 'Picanha', price: 89.9 })
    await api('POST', '/shifts')
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
    await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: id, quantity: 2 } })

    const updated = await api('PATCH', `/menu-items/${id}`, { body: { price: 99.5 } })
    assert.equal(updated.json.data.price, 99.5)

    const order = await api('GET', `/orders/${orderId}`, { role: 'waiter' })
    assert.equal(order.json.data.items[0].unitPrice, 89.9)
  })

  test('lista as categorias distintas em ordem alfabética', async () => {
    await createMenuItem({ category: 'Pratos' })
    await createMenuItem({ category: 'Bebidas' })
    await createMenuItem({ category: 'Pratos', available: false })
    const res = await api('GET', '/menu-items/categories', { role: 'waiter' })
    assert.deepEqual(res.json.data, ['Bebidas', 'Pratos'])
  })
})
