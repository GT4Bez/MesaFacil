import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'

describe('Histórico de movimentos do insumo (spec 016)', () => {
  let server
  let staff
  let tableIds
  let picanha
  let carne

  const api = (method, path, { role = 'manager', body } = {}) =>
    server.api(method, path, { token: role && staff[role].token, body })
  const history = (id, params = '', role = 'manager') => api('GET', `/ingredients/${id}/movements${params}`, { role })

  // Pedido na mesa com `quantity` picanhas enviado à cozinha (baixa 0,3 kg por picanha).
  async function sell(quantity, tableId = tableIds[0]) {
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
    await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: picanha, quantity } })
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'in_kitchen' } })).status, 200)
    return orderId
  }

  before(async () => {
    await setupSchema()
    server = await startServer()
  })
  after(() => server.close())
  beforeEach(async () => {
    await resetDb()
    staff = await createStaff()
    tableIds = await createTables(4)
    await api('POST', '/shifts', { body: { openingFloat: 0 } })
    picanha = await createMenuItem({ name: 'Picanha na chapa', price: 89.9 })
    carne = (await api('POST', '/ingredients', { body: { name: 'Picanha', unit: 'kg', minStock: 2, unitCost: 70 } })).json.data
    await api('PUT', `/menu-items/${picanha}/recipe`, { body: { items: [{ ingredientId: carne.id, quantity: 0.3 }] } })
  })

  test('insumo sem movimentos: lista vazia e consistente', async () => {
    const res = await history(carne.id)
    assert.equal(res.status, 200)
    assert.deepEqual(res.json.data, { ingredient: carne, consistent: true, movements: [], nextBefore: null })
  })

  test('ordem, saldo depois de cada movimento, origem da venda e turno', async () => {
    await api('POST', `/ingredients/${carne.id}/purchases`, { body: { quantity: 5, unitCost: 79.9 } })
    await api('POST', `/ingredients/${carne.id}/adjustments`, { body: { countedQuantity: 4.8, reason: 'Aparas' } })
    await sell(1, tableIds[0])
    const orderId = await sell(2, tableIds[1])

    const { ingredient, consistent, movements, nextBefore } = (await history(carne.id)).json.data
    assert.equal(consistent, true)
    assert.equal(nextBefore, null)
    assert.equal(ingredient.stockQuantity, 3.9)
    assert.deepEqual(
      movements.map((m) => [m.type, m.quantity, m.balanceAfter, m.by]),
      [
        ['sale', -0.6, 3.9, staff.waiter.name],
        ['sale', -0.3, 4.5, staff.waiter.name],
        ['adjustment', -0.2, 4.8, staff.manager.name],
        ['purchase', 5, 5, staff.manager.name],
      ],
    )
    assert.equal(movements[0].balanceAfter, ingredient.stockQuantity)
    assert.deepEqual(movements[0].sale, { orderId, tableNumber: 2, menuItem: 'Picanha na chapa', itemQuantity: 2 })
    assert.equal(movements[0].unitCost, 79.9)
    assert.equal(movements[2].reason, 'Aparas')
    assert.equal(movements[3].sale, null)
    const { rows } = await query(`SELECT id::text FROM shifts WHERE status = 'open'`)
    assert.ok(movements.every((m) => m.shiftId === rows[0].id))
  })

  test('filtro por tipo mantém o saldo de todos os tipos; paginação por cursor não repete nem pula', async () => {
    await api('POST', `/ingredients/${carne.id}/purchases`, { body: { quantity: 10, unitCost: 70 } })
    for (let i = 0; i < 3; i++) await sell(1, tableIds[i])
    await api('POST', `/ingredients/${carne.id}/purchases`, { body: { quantity: 1, unitCost: 70 } })

    const sales = (await history(carne.id, '?type=sale')).json.data.movements
    assert.deepEqual(sales.map((m) => [m.type, m.balanceAfter]), [['sale', 9.1], ['sale', 9.4], ['sale', 9.7]])

    const all = (await history(carne.id)).json.data.movements.map((m) => m.id)
    const seen = []
    let cursor = ''
    let pages = 0
    do {
      const page = (await history(carne.id, `?limit=2${cursor && `&before=${cursor}`}`)).json.data
      seen.push(...page.movements.map((m) => m.id))
      cursor = page.nextBefore
      pages++
      // Venda e entrada novas no meio da paginação têm id maior que o cursor: não entram nas páginas seguintes.
      if (pages === 1) {
        await sell(1, tableIds[3])
        await api('POST', `/ingredients/${carne.id}/purchases`, { body: { quantity: 2, unitCost: 70 } })
      }
    } while (cursor)
    assert.deepEqual(seen, all)
    assert.equal(pages, 3)

    const salesPage = (await history(carne.id, `?type=sale&limit=2&before=${sales[0].id}`)).json.data
    assert.deepEqual(salesPage.movements.map((m) => m.id), [sales[1].id, sales[2].id])
    assert.equal(salesPage.nextBefore, null)
  })

  test('divergência entre o estoque e a soma dos movimentos → consistent: false', async () => {
    await api('POST', `/ingredients/${carne.id}/purchases`, { body: { quantity: 5, unitCost: 70 } })
    await query(`UPDATE ingredients SET stock_quantity = 7 WHERE id = $1`, [carne.id])
    const res = (await history(carne.id, '?type=sale')).json.data
    assert.equal(res.consistent, false)
    assert.deepEqual(res.movements, [])
  })

  test('parâmetros inválidos → 422; inexistente → 404; acesso por papel', async () => {
    for (const params of ['?limit=0', '?limit=101', '?limit=abc', '?limit=1.5', '?before=0', '?before=x', '?type=expense', '?limit=1&limit=2']) {
      assert.equal((await history(carne.id, params)).status, 422, params)
    }
    assert.equal((await history('999999')).status, 404)
    assert.equal((await server.api('GET', `/ingredients/${carne.id}/movements`)).status, 401)
    for (const role of ['waiter', 'cashier', 'kitchen']) assert.equal((await history(carne.id, '', role)).status, 403, role)
    assert.equal((await history(carne.id, '', 'admin')).status, 200)

    // Insumo inativo também tem histórico.
    await api('PATCH', `/ingredients/${carne.id}`, { body: { active: false } })
    assert.equal((await history(carne.id)).status, 200)
  })
})
