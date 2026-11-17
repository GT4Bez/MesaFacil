import './helpers.js'
import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { DatabaseConnection } from '../src/database/DatabaseConnection.js'

const ACTIVE_ORDER_STATUSES = ['open', 'in_kitchen', 'ready_to_pay']

let state

function resetDb() {
  state = {
    seq: { shifts: 1, orders: 1, order_items: 1, payments: 1 },
    shifts: [],
    tables: [
      { id: 1n, number: 1, status: 'available' },
      { id: 2n, number: 2, status: 'available' },
    ],
    menu_items: [
      { id: 1n, name: 'Picanha', category: 'Pratos', price: '89.90', available: true },
      { id: 2n, name: 'Suco', category: 'Bebidas', price: '10.00', available: true },
      { id: 3n, name: 'Indisponível', category: 'Pratos', price: '50.00', available: false },
    ],
    orders: [],
    order_items: [],
    payments: [],
  }
}

resetDb()

const pgError = (code, constraint) => Object.assign(new Error(`pg ${code}`), { code, constraint })

function toBigInt(value) {
  if (!/^-?\d+$/.test(String(value))) throw pgError('22P02')
  return BigInt(value)
}

// Simula as queries e constraints das migrations 001–007 para testar rotas e regras sem Postgres externo.
function executeFakeSql(sql, params = []) {
  const q = sql.replace(/\s+/g, ' ').trim()

  if (q.startsWith('SELECT t.id, t.number, o.id AS active_order_id FROM tables t')) {
    return {
      rows: [...state.tables]
        .sort((a, b) => a.number - b.number)
        .map((t) => {
          const active = state.orders.find(
            (o) => o.table_id === t.id && ACTIVE_ORDER_STATUSES.includes(o.status),
          )
          return { id: t.id, number: t.number, active_order_id: active ? active.id : null }
        }),
    }
  }

  if (q.startsWith("SELECT id, status, opened_at, closed_at FROM shifts WHERE status = 'open'")) {
    const s = state.shifts.find((x) => x.status === 'open')
    return { rows: s ? [s] : [] }
  }

  if (q.startsWith("SELECT id FROM shifts WHERE status = 'open'")) {
    const s = state.shifts.find((x) => x.status === 'open')
    return { rows: s ? [{ id: s.id }] : [] }
  }

  if (q.startsWith('INSERT INTO shifts (opened_by)')) {
    if (state.shifts.some((x) => x.status === 'open')) throw pgError('23505', 'shifts_single_open_idx')
    const shift = {
      id: BigInt(state.seq.shifts++),
      opened_by: toBigInt(params[0]),
      opened_at: new Date().toISOString(),
      closed_at: null,
      status: 'open',
    }
    state.shifts.push(shift)
    return { rows: [shift] }
  }

  if (q.startsWith("UPDATE shifts SET status = 'closed'")) {
    const id = toBigInt(params[0])
    const s = state.shifts.find((x) => x.id === id)
    const hasActive = state.orders.some(
      (o) => o.shift_id === id && ACTIVE_ORDER_STATUSES.includes(o.status),
    )
    if (!s || s.status !== 'open' || hasActive) return { rows: [] }
    s.status = 'closed'
    s.closed_at = new Date().toISOString()
    return { rows: [s] }
  }

  if (q.startsWith('SELECT id, status, opened_at, closed_at FROM shifts WHERE id = $1')) {
    const s = state.shifts.find((x) => x.id === toBigInt(params[0]))
    return { rows: s ? [s] : [] }
  }

  if (q.startsWith('SELECT id, name, category, price FROM menu_items WHERE available')) {
    return { rows: state.menu_items.filter((m) => m.available) }
  }

  if (q.startsWith('SELECT id, price FROM menu_items WHERE id = $1 AND available')) {
    const m = state.menu_items.find((x) => x.id === toBigInt(params[0]) && x.available)
    return { rows: m ? [{ id: m.id, price: m.price }] : [] }
  }

  if (q.startsWith('SELECT 1 FROM tables WHERE id = $1')) {
    const id = toBigInt(params[0])
    return { rows: state.tables.some((t) => t.id === id) ? [{ '?column?': 1 }] : [] }
  }

  if (q.startsWith('INSERT INTO orders (table_id, shift_id, user_id)')) {
    const tableId = toBigInt(params[0])
    if (state.orders.some((o) => o.table_id === tableId && ACTIVE_ORDER_STATUSES.includes(o.status))) {
      throw pgError('23505', 'orders_single_active_per_table_idx')
    }
    const order = {
      id: BigInt(state.seq.orders++),
      table_id: tableId,
      shift_id: toBigInt(params[1]),
      user_id: toBigInt(params[2]),
      status: 'open',
      created_at: new Date().toISOString(),
    }
    state.orders.push(order)
    return { rows: [{ id: order.id }] }
  }

  if (q.startsWith('UPDATE tables SET status = $2 WHERE id = $1')) {
    const t = state.tables.find((x) => x.id === toBigInt(params[0]))
    if (t) t.status = params[1]
    return { rows: [] }
  }

  if (q.startsWith('SELECT o.id, o.table_id, o.status, o.created_at, t.number AS table_number FROM orders o')) {
    const o = state.orders.find((x) => x.id === toBigInt(params[0]))
    if (!o) return { rows: [] }
    const t = state.tables.find((x) => x.id === o.table_id)
    return {
      rows: [{ id: o.id, table_id: o.table_id, status: o.status, created_at: o.created_at, table_number: t.number }],
    }
  }

  if (q.startsWith('SELECT oi.id, oi.order_id, oi.menu_item_id, m.name, oi.quantity, oi.unit_price, oi.notes, oi.status FROM order_items oi JOIN menu_items m ON m.id = oi.menu_item_id WHERE oi.order_id = $1')) {
    const orderId = toBigInt(params[0])
    return {
      rows: state.order_items
        .filter((i) => i.order_id === orderId)
        .map((i) => ({ ...i, name: state.menu_items.find((m) => m.id === i.menu_item_id).name })),
    }
  }

  if (q.startsWith('SELECT oi.id, oi.order_id, oi.menu_item_id, m.name, oi.quantity, oi.unit_price, oi.notes, oi.status FROM order_items oi JOIN menu_items m ON m.id = oi.menu_item_id WHERE oi.id = $1')) {
    const i = state.order_items.find((x) => x.id === toBigInt(params[0]))
    if (!i) return { rows: [] }
    return {
      rows: [{ ...i, name: state.menu_items.find((m) => m.id === i.menu_item_id).name }],
    }
  }

  if (q.startsWith('INSERT INTO order_items')) {
    const qty = Number(params[2])
    if (!Number.isInteger(qty) || qty > 2147483647) throw pgError('22003')
    if (qty <= 0) throw pgError('23514', 'order_items_quantity_check')
    const item = {
      id: BigInt(state.seq.order_items++),
      order_id: toBigInt(params[0]),
      menu_item_id: toBigInt(params[1]),
      quantity: qty,
      unit_price: String(params[3]),
      notes: params[4],
      status: 'pending',
      canceled_by: null,
      cancellation_reason: null,
    }
    state.order_items.push(item)
    return { rows: [{ id: item.id }] }
  }

  if (q.startsWith('UPDATE order_items SET quantity = $2 WHERE id = $1')) {
    const qty = Number(params[1])
    if (!Number.isInteger(qty) || qty > 2147483647) throw pgError('22003')
    const i = state.order_items.find((x) => x.id === toBigInt(params[0]))
    if (i) i.quantity = qty
    return { rows: [] }
  }

  if (q.startsWith('UPDATE order_items SET status = $2 WHERE id = $1')) {
    const i = state.order_items.find((x) => x.id === toBigInt(params[0]))
    if (i) i.status = params[1]
    return { rows: [] }
  }

  if (q.startsWith("UPDATE order_items SET status = 'canceled'")) {
    const canceledBy = params[1] == null ? null : toBigInt(params[1])
    const reason = params[2]
    if (canceledBy !== null && (!reason || !String(reason).trim())) {
      throw pgError('23514', 'order_items_cancellation_reason_check')
    }
    const i = state.order_items.find((x) => x.id === toBigInt(params[0]))
    if (i) {
      i.status = 'canceled'
      i.canceled_by = canceledBy
      i.cancellation_reason = reason
    }
    return { rows: [] }
  }

  if (q.startsWith("UPDATE order_items SET status = 'sent' WHERE order_id = $1 AND status = 'pending'")) {
    const orderId = toBigInt(params[0])
    for (const i of state.order_items) {
      if (i.order_id === orderId && i.status === 'pending') i.status = 'sent'
    }
    return { rows: [] }
  }

  if (q.startsWith('UPDATE orders SET status = $2 WHERE id = $1')) {
    const o = state.orders.find((x) => x.id === toBigInt(params[0]))
    if (o) o.status = params[1]
    return { rows: [] }
  }

  if (q.startsWith('SELECT id, amount, payment_method, created_at FROM payments WHERE order_id = $1')) {
    const orderId = toBigInt(params[0])
    return { rows: state.payments.filter((p) => p.order_id === orderId) }
  }

  if (q.startsWith('INSERT INTO payments')) {
    const amount = Number(params[1])
    if (!Number.isFinite(amount) || amount >= 1e8) throw pgError('22003')
    if (!(amount > 0)) throw pgError('23514', 'payments_amount_check')
    const payment = {
      id: BigInt(state.seq.payments++),
      order_id: toBigInt(params[0]),
      amount: String(amount),
      payment_method: params[2],
      created_at: new Date().toISOString(),
    }
    state.payments.push(payment)
    return { rows: [{ id: payment.id }] }
  }

  throw new Error(`Query não suportada no fake DB: ${q}`)
}

DatabaseConnection.instance = {
  async query(sql, params) {
    return executeFakeSql(sql, params)
  },
  async withTransaction(callback) {
    const snapshot = structuredClone(state)
    try {
      return await callback({ query: async (sql, params) => executeFakeSql(sql, params) })
    } catch (error) {
      state = snapshot
      throw error
    }
  },
  async close() {},
}

const { default: app } = await import('../src/app.js')

let server
let base

const tokens = {
  waiter: jwt.sign({ id: '1', name: 'Carlos', email: 'garcom@mesafacil.com', role: 'waiter' }, process.env.JWT_SECRET),
  kitchen: jwt.sign({ id: '2', name: 'Henrique', email: 'cozinha@mesafacil.com', role: 'kitchen' }, process.env.JWT_SECRET),
  cashier: jwt.sign({ id: '3', name: 'Ana', email: 'caixa@mesafacil.com', role: 'cashier' }, process.env.JWT_SECRET),
  manager: jwt.sign({ id: '4', name: 'Mariana', email: 'gerente@mesafacil.com', role: 'manager' }, process.env.JWT_SECRET),
}

async function api(method, path, { role = 'manager', body } = {}) {
  const headers = {}
  if (role) headers.Authorization = `Bearer ${tokens[role]}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

describe('Fluxo de mesas, turnos, pedidos, itens e caixa', () => {
  before(async () => {
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    base = `http://127.0.0.1:${server.address().port}`
  })
  after(() => server.close())
  beforeEach(() => resetDb())

  test('exige autenticação (401) em todas as rotas operacionais', async () => {
    const endpoints = [
      ['GET', '/tables'],
      ['GET', '/shifts/active'],
      ['POST', '/shifts'],
      ['PATCH', '/shifts/1/close'],
      ['GET', '/menu-items'],
      ['POST', '/orders'],
      ['GET', '/orders/1'],
      ['PATCH', '/orders/1/status'],
      ['POST', '/orders/1/items'],
      ['PATCH', '/order-items/1/quantity'],
      ['PATCH', '/order-items/1/status'],
      ['GET', '/orders/1/bill'],
      ['POST', '/orders/1/payments'],
    ]
    for (const [method, path] of endpoints) {
      const res = await api(method, path, { role: null })
      assert.equal(res.status, 401, `${method} ${path} deveria retornar 401`)
    }
  })

  test('turnos (RN-02): apenas gerente abre/encerra; bloqueia duplicidade e fechamento com pedido ativo', async () => {
    const initial = await api('GET', '/shifts/active', { role: 'waiter' })
    assert.equal(initial.status, 200)
    assert.equal(initial.json.data, null)

    assert.equal((await api('POST', '/shifts', { role: 'waiter' })).status, 403)

    const opened = await api('POST', '/shifts', { role: 'manager' })
    assert.equal(opened.status, 201)
    assert.equal(opened.json.data.status, 'open')
    const shiftId = opened.json.data.id

    assert.equal((await api('POST', '/shifts', { role: 'manager' })).status, 409)

    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId: '1' } })).json.data.id
    assert.equal((await api('PATCH', `/shifts/${shiftId}/close`, { role: 'manager' })).status, 409)

    await api('PATCH', `/orders/${orderId}/status`, { role: 'manager', body: { status: 'canceled' } })
    const closed = await api('PATCH', `/shifts/${shiftId}/close`, { role: 'manager' })
    assert.equal(closed.status, 200)
    assert.equal(closed.json.data.status, 'closed')

    assert.equal((await api('PATCH', `/shifts/${shiftId}/close`, { role: 'manager' })).status, 409)
    assert.equal((await api('PATCH', '/shifts/999/close', { role: 'manager' })).status, 404)
  })

  test('mesas e abertura de pedido (RN-01, RN-02 e RBAC)', async () => {
    assert.equal((await api('POST', '/orders', { role: 'waiter', body: { tableId: '1' } })).status, 409)
    await api('POST', '/shifts', { role: 'manager' })

    assert.equal((await api('POST', '/orders', { role: 'waiter', body: {} })).status, 400)
    assert.equal((await api('POST', '/orders', { role: 'waiter', body: { tableId: '999' } })).status, 404)
    assert.equal((await api('POST', '/orders', { role: 'kitchen', body: { tableId: '1' } })).status, 403)
    assert.equal((await api('POST', '/orders', { role: 'cashier', body: { tableId: '1' } })).status, 403)

    const created = await api('POST', '/orders', { role: 'waiter', body: { tableId: '1' } })
    assert.equal(created.status, 201)
    const orderId = created.json.data.id

    assert.equal((await api('POST', '/orders', { role: 'waiter', body: { tableId: '1' } })).status, 409)

    const tables = await api('GET', '/tables', { role: 'waiter' })
    assert.deepEqual(tables.json.data, [
      { id: '1', number: 1, status: 'occupied', activeOrderId: orderId },
      { id: '2', number: 2, status: 'available', activeOrderId: null },
    ])
  })

  test('cardápio e snapshot de preço (RN-09) com proteção a overflow inteiro', async () => {
    await api('POST', '/shifts', { role: 'manager' })
    const menu = await api('GET', '/menu-items', { role: 'waiter' })
    assert.equal(menu.json.data.length, 2)

    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId: '1' } })).json.data.id
    assert.equal(
      (await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: '3', quantity: 1 } })).status,
      404,
    )
    assert.equal(
      (await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: '1', quantity: 9999999999999 } })).status,
      422,
    )

    const added = await api('POST', `/orders/${orderId}/items`, {
      role: 'waiter',
      body: { menuItemId: '1', quantity: 2, notes: '  ao ponto  ' },
    })
    assert.equal(added.status, 201)

    state.menu_items[0].price = '120.00'
    const order = await api('GET', `/orders/${orderId}`, { role: 'waiter' })
    assert.equal(order.json.data.items[0].unitPrice, 89.9)
    assert.equal(order.json.data.items[0].notes, 'ao ponto')
  })

  test('RBAC e validações nas transições de pedido, cancelamento pendente e pagamento', async () => {
    await api('POST', '/shifts', { role: 'manager' })
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId: '1' } })).json.data.id
    const pendingItemId = (
      await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: '2', quantity: 1 } })
    ).json.data.id

    // Cozinha e caixa não removem item pending nem enviam pedido à cozinha
    assert.equal(
      (await api('PATCH', `/order-items/${pendingItemId}/status`, { role: 'kitchen', body: { status: 'canceled' } })).status,
      403,
    )
    assert.equal(
      (await api('PATCH', `/order-items/${pendingItemId}/status`, { role: 'cashier', body: { status: 'canceled' } })).status,
      403,
    )
    assert.equal(
      (await api('PATCH', `/orders/${orderId}/status`, { role: 'kitchen', body: { status: 'in_kitchen' } })).status,
      403,
    )

    // Garçom pode cancelar item pending
    assert.equal(
      (await api('PATCH', `/order-items/${pendingItemId}/status`, { role: 'waiter', body: { status: 'canceled' } })).status,
      200,
    )

    // Pagamento abaixo de 1 centavo ou acima do limite DECIMAL(10,2) falha na validação de domínio (422)
    const tinyPay = await api('POST', `/orders/${orderId}/payments`, {
      role: 'cashier',
      body: { amount: 0.001, method: 'pix' },
    })
    assert.equal(tinyPay.status, 422)
    assert.equal(tinyPay.json.error, 'Valor do pagamento inválido.')

    const hugePay = await api('POST', `/orders/${orderId}/payments`, {
      role: 'cashier',
      body: { amount: 1e12, method: 'pix' },
    })
    assert.equal(hugePay.status, 422)
  })

  test('fluxo completo ponta a ponta (RN-03 a RN-08) com RBAC de fechamento', async () => {
    await api('POST', '/shifts', { role: 'manager' })
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId: '1' } })).json.data.id

    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'in_kitchen' } })).status, 409)

    const item1 = (await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: '1', quantity: 1 } })).json.data.id
    const item2 = (await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: '2', quantity: 2 } })).json.data.id

    assert.equal((await api('PATCH', `/order-items/${item2}/quantity`, { role: 'waiter', body: { quantity: 0 } })).status, 422)
    assert.equal((await api('PATCH', `/order-items/${item2}/quantity`, { role: 'waiter', body: { quantity: 1 } })).status, 200)
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'ready_to_pay' } })).status, 409)

    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'in_kitchen' } })).status, 200)
    assert.equal((await api('PATCH', `/order-items/${item1}/quantity`, { role: 'waiter', body: { quantity: 3 } })).status, 409)

    // RN-05: cancelar item enviado exige gerente e motivo
    assert.equal((await api('PATCH', `/order-items/${item2}/status`, { role: 'waiter', body: { status: 'canceled', reason: 'erro' } })).status, 403)
    assert.equal((await api('PATCH', `/order-items/${item2}/status`, { role: 'manager', body: { status: 'canceled', reason: '  ' } })).status, 422)
    assert.equal((await api('PATCH', `/order-items/${item2}/status`, { role: 'manager', body: { status: 'canceled', reason: 'Sem estoque' } })).status, 200)

    // Cozinha prepara e conclui item1
    assert.equal((await api('PATCH', `/order-items/${item1}/status`, { role: 'waiter', body: { status: 'preparing' } })).status, 403)
    assert.equal((await api('PATCH', `/order-items/${item1}/status`, { role: 'kitchen', body: { status: 'ready' } })).status, 409)
    assert.equal((await api('PATCH', `/order-items/${item1}/status`, { role: 'kitchen', body: { status: 'preparing' } })).status, 200)

    // RN-06: bloqueia ready_to_pay enquanto há item em preparo
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'ready_to_pay' } })).status, 409)

    assert.equal((await api('PATCH', `/order-items/${item1}/status`, { role: 'kitchen', body: { status: 'ready' } })).status, 200)
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'kitchen', body: { status: 'ready_to_pay' } })).status, 403)
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'ready_to_pay' } })).status, 200)

    // RN-08: conta ignora item2 cancelado
    const bill = await api('GET', `/orders/${orderId}/bill?serviceTax=true`, { role: 'cashier' })
    assert.equal(bill.json.data.subtotal, 89.9)
    assert.equal(bill.json.data.serviceTaxAmount, 8.99)
    assert.equal(bill.json.data.total, 98.89)

    // RN-07: pagamento parcial + bloqueio de fechamento por waiter/com saldo aberto
    assert.equal((await api('POST', `/orders/${orderId}/payments`, { role: 'waiter', body: { amount: 50, method: 'pix' } })).status, 403)
    assert.equal((await api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount: 50, method: 'pix' } })).status, 201)
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'cashier', body: { status: 'closed' } })).status, 409)

    assert.equal((await api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount: 39.9, method: 'cash' } })).status, 201)
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'closed' } })).status, 403)
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'cashier', body: { status: 'closed' } })).status, 200)

    const tables = await api('GET', '/tables', { role: 'waiter' })
    assert.equal(tables.json.data[0].status, 'available')
    assert.equal(tables.json.data[0].activeOrderId, null)
  })
})
