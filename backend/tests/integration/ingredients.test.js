import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'

describe('Insumos, ficha técnica, baixa automática e CMV (RN-15)', () => {
  let server
  let staff
  let tableIds
  let menu
  let shiftId

  const api = (method, path, { role = 'manager', body } = {}) =>
    server.api(method, path, { token: role && staff[role].token, body })

  const createIngredient = async (body) => (await api('POST', '/ingredients', { body })).json.data
  const ingredient = async (id) =>
    (await api('GET', '/ingredients')).json.data.find((item) => item.id === id)
  const saveRecipe = (menuItemId, items) => api('PUT', `/menu-items/${menuItemId}/recipe`, { body: { items } })

  const createOrder = async (tableId = tableIds[0]) =>
    (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
  const addItem = async (orderId, menuItemId, quantity = 1, role = 'waiter') =>
    (await api('POST', `/orders/${orderId}/items`, { role, body: { menuItemId, quantity } })).json.data.id
  const send = (orderId) => api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'in_kitchen' } })

  before(async () => {
    await setupSchema()
    server = await startServer()
  })
  after(() => server.close())
  beforeEach(async () => {
    await resetDb()
    staff = await createStaff()
    tableIds = await createTables(2)
    menu = {
      picanha: await createMenuItem({ name: 'Picanha', price: 89.9 }),
      suco: await createMenuItem({ name: 'Suco', category: 'Bebidas', price: 10 }),
    }
    shiftId = (await api('POST', '/shifts', { body: { openingFloat: 0 } })).json.data.id
  })

  test('cadastro: validação, nome único sem diferenciar maiúsculas, unidade imutável e só gerente/admin', async () => {
    const created = await api('POST', '/ingredients', {
      body: { name: '  Picanha  ', unit: 'kg', minStock: 2, unitCost: 69.9 },
    })
    assert.equal(created.status, 201)
    assert.deepEqual(created.json.data, {
      id: created.json.data.id,
      name: 'Picanha',
      unit: 'kg',
      stockQuantity: 0,
      minStock: 2,
      unitCost: 69.9,
      active: true,
      belowMin: true,
    })

    assert.equal((await api('POST', '/ingredients', { body: { name: 'picanha', unit: 'kg' } })).status, 409)
    for (const body of [{ name: '', unit: 'kg' }, { name: 'Sal', unit: 'g' }, { name: 'Sal', unit: 'kg', minStock: -1 }, { name: 'Sal', unit: 'kg', unitCost: '3' }]) {
      assert.equal((await api('POST', '/ingredients', { body })).status, 422, JSON.stringify(body))
    }

    const id = created.json.data.id
    assert.equal((await api('PATCH', `/ingredients/${id}`, { body: { unit: 'l' } })).status, 422)
    const patched = await api('PATCH', `/ingredients/${id}`, { body: { minStock: 0, active: false } })
    assert.equal(patched.status, 200)
    assert.equal(patched.json.data.belowMin, false)
    assert.equal(patched.json.data.active, false)
    assert.equal((await api('PATCH', '/ingredients/999999', { body: { minStock: 1 } })).status, 404)

    for (const role of ['waiter', 'kitchen', 'cashier']) {
      assert.equal((await api('GET', '/ingredients', { role })).status, 403, role)
    }
    assert.equal((await api('GET', '/ingredients', { role: null })).status, 401)
    assert.equal((await api('GET', '/ingredients', { role: 'admin' })).status, 200)
  })

  test('entrada soma ao estoque e atualiza o custo; ajuste grava a diferença e audita', async () => {
    const { id } = await createIngredient({ name: 'Batata', unit: 'kg', minStock: 5, unitCost: 6 })

    assert.equal((await api('POST', `/ingredients/${id}/purchases`, { body: { quantity: 0, unitCost: 6 } })).status, 422)
    const purchase = await api('POST', `/ingredients/${id}/purchases`, { body: { quantity: 20.5, unitCost: 6.4 } })
    assert.equal(purchase.status, 201)
    assert.equal(purchase.json.data.stockQuantity, 20.5)
    assert.equal(purchase.json.data.unitCost, 6.4)

    assert.equal((await api('POST', `/ingredients/${id}/adjustments`, { body: { countedQuantity: 18 } })).status, 422)
    assert.equal(
      (await api('POST', `/ingredients/${id}/adjustments`, { body: { countedQuantity: 20.5, reason: 'Contagem' } })).status,
      422,
    )
    const adjusted = await api('POST', `/ingredients/${id}/adjustments`, {
      body: { countedQuantity: 18.25, reason: ' Perda na câmara fria ' },
    })
    assert.equal(adjusted.status, 201)
    assert.equal(adjusted.json.data.stockQuantity, 18.25)

    const { rows: movements } = await query(
      `SELECT type, quantity, unit_cost, reason, shift_id FROM stock_movements WHERE ingredient_id = $1 ORDER BY id`,
      [id],
    )
    assert.deepEqual(
      movements.map((row) => [row.type, Number(row.quantity), Number(row.unit_cost), row.reason, String(row.shift_id)]),
      [
        ['purchase', 20.5, 6.4, null, shiftId],
        ['adjustment', -2.25, 6.4, 'Perda na câmara fria', shiftId],
      ],
    )
    const { rows: logs } = await query(`SELECT * FROM audit_logs WHERE action = 'stock.adjusted'`)
    assert.equal(logs.length, 1)
    assert.equal(String(logs[0].user_id), staff.manager.id)
    assert.deepEqual(logs[0].details, { from: 20.5, to: 18.25, difference: -2.25, reason: 'Perda na câmara fria' })
  })

  test('ficha técnica: validação, insumo inativo (409), custo e margem', async () => {
    const carne = await createIngredient({ name: 'Picanha', unit: 'kg', unitCost: 70 })
    const arroz = await createIngredient({ name: 'Arroz', unit: 'kg', unitCost: 5.8 })
    const velho = await createIngredient({ name: 'Tempero antigo', unit: 'kg', active: false })

    assert.equal((await saveRecipe(menu.picanha, [{ ingredientId: carne.id, quantity: 0 }])).status, 422)
    assert.equal(
      (await saveRecipe(menu.picanha, [{ ingredientId: carne.id, quantity: 1 }, { ingredientId: carne.id, quantity: 2 }])).status,
      422,
    )
    assert.equal((await saveRecipe(menu.picanha, [{ ingredientId: '999999', quantity: 1 }])).status, 404)
    assert.equal((await saveRecipe(menu.picanha, [{ ingredientId: velho.id, quantity: 1 }])).status, 409)
    assert.equal((await saveRecipe('999999', [])).status, 404)
    assert.equal((await api('PUT', `/menu-items/${menu.picanha}/recipe`, { body: {} })).status, 422)
    assert.equal(
      (await api('PUT', `/menu-items/${menu.picanha}/recipe`, { role: 'waiter', body: { items: [] } })).status,
      403,
    )

    const saved = await saveRecipe(menu.picanha, [
      { ingredientId: carne.id, quantity: 0.4 },
      { ingredientId: arroz.id, quantity: 0.15 },
    ])
    assert.equal(saved.status, 200)
    // 0,4 × 70,00 + 0,15 × 5,80 = 28,00 + 0,87 = 28,87; margem = 89,90 − 28,87 = 61,03 (67,9 %).
    assert.equal(saved.json.data.cost, 28.87)
    assert.equal(saved.json.data.margin, 61.03)
    assert.equal(saved.json.data.marginPercent, 67.9)
    assert.deepEqual(
      saved.json.data.items.map(({ name, quantity, cost }) => [name, quantity, cost]),
      [['Arroz', 0.15, 0.87], ['Picanha', 0.4, 28]],
    )

    // Insumo desativado que já está na ficha não trava a edição (só não pode entrar um inativo novo).
    await api('PATCH', `/ingredients/${arroz.id}`, { body: { active: false } })
    const kept = await saveRecipe(menu.picanha, [
      { ingredientId: carne.id, quantity: 0.35 },
      { ingredientId: arroz.id, quantity: 0.15 },
    ])
    assert.equal(kept.status, 200)
    assert.equal(kept.json.data.items.find((item) => item.name === 'Arroz').active, false)
    await api('PATCH', `/ingredients/${arroz.id}`, { body: { active: true } })

    // Substitui a ficha inteira; lista vazia remove.
    assert.equal((await saveRecipe(menu.picanha, [{ ingredientId: arroz.id, quantity: 0.2 }])).json.data.items.length, 1)
    const empty = await saveRecipe(menu.picanha, [])
    assert.deepEqual([empty.json.data.items, empty.json.data.cost], [[], 0])
    assert.equal((await api('GET', `/menu-items/${menu.picanha}/recipe`)).json.data.cost, 0)
  })

  test('envio à cozinha baixa o estoque na mesma transação, com o custo do momento; pode ficar negativo', async () => {
    const carne = await createIngredient({ name: 'Picanha', unit: 'kg', minStock: 1, unitCost: 70 })
    await api('POST', `/ingredients/${carne.id}/purchases`, { body: { quantity: 0.5, unitCost: 70 } })
    await saveRecipe(menu.picanha, [{ ingredientId: carne.id, quantity: 0.15 }])

    const orderId = await createOrder()
    const twoPicanhas = await addItem(orderId, menu.picanha, 2)
    await addItem(orderId, menu.suco) // sem ficha: vende sem baixa
    const pending = await addItem(orderId, menu.picanha, 1)
    // Item pendente removido nunca foi baixado.
    await api('PATCH', `/order-items/${pending}/status`, { role: 'waiter', body: { status: 'canceled' } })

    assert.equal((await ingredient(carne.id)).stockQuantity, 0.5)
    assert.equal((await send(orderId)).status, 200)
    assert.equal((await ingredient(carne.id)).stockQuantity, 0.2)

    const { rows } = await query(
      `SELECT order_item_id, quantity, unit_cost, shift_id, user_id FROM stock_movements WHERE type = 'sale'`,
    )
    assert.deepEqual(
      rows.map((row) => [String(row.order_item_id), Number(row.quantity), Number(row.unit_cost), String(row.shift_id), String(row.user_id)]),
      [[twoPicanhas, -0.3, 70, shiftId, staff.waiter.id]],
    )

    // Compra mais cara depois: o custo da baixa antiga não muda.
    await api('POST', `/ingredients/${carne.id}/purchases`, { body: { quantity: 0.1, unitCost: 80 } })
    const { rows: again } = await query(`SELECT unit_cost FROM stock_movements WHERE type = 'sale'`)
    assert.equal(Number(again[0].unit_cost), 70)

    // Segundo envio leva o estoque abaixo de zero: a venda não é bloqueada e o alerta aparece.
    await addItem(orderId, menu.picanha, 3)
    assert.equal((await send(orderId)).status, 200)
    const after = await ingredient(carne.id)
    assert.equal(after.stockQuantity, -0.15)
    assert.equal(after.belowMin, true)
  })

  test('relatório do turno: CMV dos pedidos encerrados, perdas dos cancelados e cobertura das fichas', async () => {
    const carne = await createIngredient({ name: 'Picanha', unit: 'kg', unitCost: 70 })
    await saveRecipe(menu.picanha, [{ ingredientId: carne.id, quantity: 0.4 }])

    // Pedido encerrado: 1 Picanha (custo 28,00) + 1 Suco (sem ficha).
    const orderId = await createOrder()
    const picanha = await addItem(orderId, menu.picanha)
    const suco = await addItem(orderId, menu.suco)
    // Mais uma Picanha enviada e cancelada pelo gerente: perda de 28,00.
    const lost = await addItem(orderId, menu.picanha)
    await send(orderId)
    await api('PATCH', `/order-items/${lost}/status`, { body: { status: 'canceled', reason: 'Caiu no chão' } })
    for (const itemId of [picanha, suco]) {
      for (const status of ['preparing', 'ready']) {
        await api('PATCH', `/order-items/${itemId}/status`, { role: 'kitchen', body: { status } })
      }
    }
    await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'ready_to_pay' } })
    await api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount: 99.9, method: 'pix' } })
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'cashier', body: { status: 'closed' } })).status, 200)

    const report = (await api('GET', `/shifts/${shiftId}/report`)).json.data
    assert.deepEqual(report.cmv, {
      revenue: 99.9,
      cost: 28,
      grossMargin: 71.9,
      marginPercent: 72,
      losses: 28,
      soldItems: 2,
      itemsWithRecipe: 1,
    })
  })

  test('valores além do limite das colunas viram 422, não 500 (entrada e baixa no envio)', async () => {
    const sal = await createIngredient({ name: 'Sal', unit: 'kg', unitCost: 1 })
    assert.equal((await api('POST', `/ingredients/${sal.id}/purchases`, { body: { quantity: 600000000, unitCost: 1 } })).status, 201)
    const overflow = await api('POST', `/ingredients/${sal.id}/purchases`, { body: { quantity: 500000000, unitCost: 1 } })
    assert.equal(overflow.status, 422)
    assert.equal(overflow.json.error, 'Um valor passou do limite permitido (número grande demais). Confira as quantidades e valores.')

    await saveRecipe(menu.suco, [{ ingredientId: sal.id, quantity: 1000 }])
    const orderId = await createOrder()
    // Gerente não tem o limite por lançamento do garçom (RN-21).
    await addItem(orderId, menu.suco, 2000000, 'manager')
    // 2.000.000 × 1.000 kg não cabe na coluna: o envio inteiro volta atrás com 422.
    assert.equal((await send(orderId)).status, 422)
    const { rows } = await query(`SELECT status FROM order_items WHERE order_id = $1`, [orderId])
    assert.equal(rows[0].status, 'pending')
    assert.equal((await ingredient(sal.id)).stockQuantity, 600000000)
  })

  test('CMV conta unidades vendidas na cobertura', async () => {
    const carne = await createIngredient({ name: 'Picanha', unit: 'kg', unitCost: 70 })
    await saveRecipe(menu.picanha, [{ ingredientId: carne.id, quantity: 0.4 }])
    const orderId = await createOrder()
    const picanhas = await addItem(orderId, menu.picanha, 3)
    const suco = await addItem(orderId, menu.suco, 2)
    await send(orderId)
    for (const itemId of [picanhas, suco]) {
      for (const status of ['preparing', 'ready']) {
        await api('PATCH', `/order-items/${itemId}/status`, { role: 'kitchen', body: { status } })
      }
    }
    await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'ready_to_pay' } })
    await api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount: 289.7, method: 'pix' } })
    await api('PATCH', `/orders/${orderId}/status`, { role: 'cashier', body: { status: 'closed' } })
    const { cmv } = (await api('GET', `/shifts/${shiftId}/report`)).json.data
    assert.equal(cmv.soldItems, 5)
    assert.equal(cmv.itemsWithRecipe, 3)
    assert.equal(cmv.cost, 84)
  })
})
