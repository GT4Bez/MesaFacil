import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'

describe('KDS da cozinha (spec 003)', () => {
  let server
  let staff
  let tableIds
  let menu

  const api = (method, path, { role = 'manager', body } = {}) =>
    server.api(method, path, { token: role && staff[role].token, body })

  async function orderWithItems(tableId, items) {
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
    const itemIds = []
    for (const [menuItemId, quantity, notes] of items) {
      const res = await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId, quantity, notes } })
      itemIds.push(res.json.data.id)
    }
    return { orderId, itemIds }
  }
  const sendToKitchen = (orderId) =>
    api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'in_kitchen' } })
  const queue = async (role = 'kitchen') => (await api('GET', '/kitchen/orders', { role })).json.data

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
    await api('POST', '/shifts', { body: { openingFloat: 0 } })
  })

  test('acesso apenas para cozinha e gerente', async () => {
    assert.equal((await api('GET', '/kitchen/orders', { role: null })).status, 401)
    assert.equal((await api('GET', '/kitchen/orders', { role: 'waiter' })).status, 403)
    assert.equal((await api('GET', '/kitchen/orders', { role: 'cashier' })).status, 403)
    assert.equal((await api('GET', '/kitchen/orders', { role: 'kitchen' })).status, 200)
    assert.equal((await api('GET', '/kitchen/orders', { role: 'manager' })).status, 200)
  })

  test('envio grava sent_at e o item aparece na fila; pending não aparece', async () => {
    const { orderId, itemIds } = await orderWithItems(tableIds[0], [[menu.picanha, 2, 'ao ponto']])
    assert.deepEqual(await queue(), [])

    assert.equal((await sendToKitchen(orderId)).status, 200)
    const { rows } = await query('SELECT sent_at FROM order_items WHERE id = $1', [itemIds[0]])
    assert.ok(rows[0].sent_at instanceof Date)

    // Item novo lançado depois do envio fica pending e não entra na fila.
    await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: menu.suco } })

    const [order] = await queue()
    assert.equal(order.orderId, orderId)
    assert.deepEqual(order.table, { number: 1 })
    assert.equal(order.items.length, 1)
    const [item] = order.items
    assert.equal(item.id, itemIds[0])
    assert.equal(item.name, 'Picanha')
    assert.equal(item.quantity, 2)
    assert.equal(item.notes, 'ao ponto')
    assert.equal(item.status, 'sent')
    assert.equal(new Date(item.sentAt).getTime(), rows[0].sent_at.getTime())
  })

  test('preparing continua na fila; ready e canceled saem', async () => {
    const { orderId, itemIds } = await orderWithItems(tableIds[0], [
      [menu.picanha, 1],
      [menu.suco, 1],
    ])
    await sendToKitchen(orderId)

    const setStatus = (itemId, body, role = 'kitchen') => api('PATCH', `/order-items/${itemId}/status`, { role, body })
    await setStatus(itemIds[0], { status: 'preparing' })
    let [order] = await queue()
    assert.deepEqual(order.items.map((item) => item.status), ['preparing', 'sent'])

    await setStatus(itemIds[0], { status: 'ready' })
    await setStatus(itemIds[1], { status: 'canceled', reason: 'Acabou' }, 'manager')
    assert.deepEqual(await queue(), [])
  })

  test('ordem de chegada: pedido com o item mais antigo primeiro', async () => {
    const first = await orderWithItems(tableIds[0], [[menu.picanha, 1]])
    const second = await orderWithItems(tableIds[1], [[menu.suco, 1]])
    await sendToKitchen(first.orderId)
    await sendToKitchen(second.orderId)

    // Força horários distintos e invertidos para não depender do relógio entre requisições.
    await query(`UPDATE order_items SET sent_at = now() - interval '10 minutes' WHERE id = $1`, [second.itemIds[0]])
    await query(`UPDATE order_items SET sent_at = now() - interval '2 minutes' WHERE id = $1`, [first.itemIds[0]])

    assert.deepEqual((await queue()).map((order) => order.orderId), [second.orderId, first.orderId])
  })

  test('banco recusa item enviado sem sent_at', async () => {
    const { itemIds } = await orderWithItems(tableIds[0], [[menu.picanha, 1]])
    await assert.rejects(
      query(`UPDATE order_items SET status = 'sent' WHERE id = $1`, [itemIds[0]]),
      (error) => error.constraint === 'order_items_sent_at_check',
    )
  })

  test('reenvio no mesmo pedido preserva sent_at dos itens antigos e ordena fila pelo mais antigo', async () => {
    const first = await orderWithItems(tableIds[0], [[menu.picanha, 1]])
    await sendToKitchen(first.orderId)
    await query(`UPDATE order_items SET sent_at = now() - interval '15 minutes' WHERE id = $1`, [first.itemIds[0]])
    const [{ sent_at: originalSentAt }] = (
      await query('SELECT sent_at FROM order_items WHERE id = $1', [first.itemIds[0]])
    ).rows

    const second = await orderWithItems(tableIds[1], [[menu.suco, 1]])
    await sendToKitchen(second.orderId)
    await query(`UPDATE order_items SET sent_at = now() - interval '5 minutes' WHERE id = $1`, [second.itemIds[0]])

    const extra = await api('POST', `/orders/${first.orderId}/items`, {
      role: 'waiter',
      body: { menuItemId: menu.suco, quantity: 1 },
    })
    assert.equal((await sendToKitchen(first.orderId)).status, 200)

    const [{ sent_at: preservedSentAt }] = (
      await query('SELECT sent_at FROM order_items WHERE id = $1', [first.itemIds[0]])
    ).rows
    assert.equal(preservedSentAt.getTime(), originalSentAt.getTime())

    const currentQueue = await queue()
    assert.deepEqual(currentQueue.map((order) => order.orderId), [first.orderId, second.orderId])
    assert.equal(currentQueue[0].items.map((item) => item.id).includes(extra.json.data.id), true)
  })
})
