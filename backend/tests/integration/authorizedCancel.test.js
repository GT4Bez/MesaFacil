import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createTables, createMenuItem, createUser } from '../support/factories.js'
import { startServer } from '../support/server.js'
import { TEST_PASSWORD } from '../support/env.js'

const INVALID = 'Autorização recusada: e-mail ou senha do gerente incorretos, ou o usuário não é um gerente ativo.'
const OVERPAID = 'O valor já pago passaria do novo total da conta. Estorno não é suportado.'

describe('Cancelamento de item no caixa com autorização do gerente (RN-17)', () => {
  let server
  let staff
  let tableIds
  let menu
  let shiftId

  const api = (method, path, { role = 'manager', body } = {}) =>
    server.api(method, path, { token: role && staff[role].token, body })

  const approver = (role = 'manager', password = TEST_PASSWORD) => ({ email: staff[role].email, password })
  const authorizedCancel = (itemId, body, role = 'cashier') =>
    api('POST', `/order-items/${itemId}/authorized-cancel`, { role, body })

  // Pedido na mesa com Picanha (89,90) e Suco (10,00) enviados à cozinha; total = 99,90 (taxa de serviço desligada por padrão).
  async function orderInKitchen(tableId = tableIds[0]) {
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
    const add = async (menuItemId) =>
      (await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId } })).json.data.id
    const picanha = await add(menu.picanha)
    const suco = await add(menu.suco)
    await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'in_kitchen' } })
    return { orderId, picanha, suco }
  }
  const pay = (orderId, amount, method = 'card') =>
    api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount, method } })
  const bill = async (orderId) => (await api('GET', `/orders/${orderId}/bill`, { role: 'cashier' })).json.data

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

  test('caixa cancela item enviado com autorização do gerente; conta, KDS, auditoria e relatório refletem', async () => {
    const { orderId, picanha } = await orderInKitchen()

    const res = await authorizedCancel(picanha, {
      reason: '  Cliente não recebeu o prato ',
      approver: { email: `  ${staff.manager.email.toUpperCase()} `, password: TEST_PASSWORD },
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.json.data, {
      id: picanha,
      status: 'canceled',
      approvedBy: { id: staff.manager.id, name: staff.manager.name },
    })

    const after = await bill(orderId)
    assert.deepEqual(after.items.map((item) => item.name), ['Suco'])
    assert.equal(after.total, 10)

    const kitchen = await api('GET', '/kitchen/orders', { role: 'kitchen' })
    const kitchenItems = kitchen.json.data.flatMap((order) => order.items.map((item) => String(item.id)))
    assert.ok(!kitchenItems.includes(picanha))

    const { rows: items } = await query(
      `SELECT canceled_by, cancellation_reason FROM order_items WHERE id = $1`,
      [picanha]
    )
    assert.equal(String(items[0].canceled_by), staff.manager.id)
    assert.equal(items[0].cancellation_reason, 'Cliente não recebeu o prato')

    const { rows: logs } = await query(`SELECT * FROM audit_logs WHERE action = 'order_item.canceled'`)
    assert.equal(logs.length, 1)
    assert.equal(String(logs[0].user_id), staff.cashier.id)
    assert.deepEqual(logs[0].details, {
      orderId,
      reason: 'Cliente não recebeu o prato',
      previousStatus: 'sent',
      approvedBy: { id: staff.manager.id, name: staff.manager.name },
    })

    const report = await api('GET', `/shifts/${shiftId}/report`)
    assert.deepEqual(
      report.json.data.cancellations.items.map(({ name, by }) => ({ name, by })),
      [{ name: 'Picanha', by: staff.manager.name }]
    )
  })

  test('o admin também autoriza', async () => {
    const { suco } = await orderInKitchen()
    const res = await authorizedCancel(suco, { reason: 'Lançado em dobro', approver: approver('admin') })
    assert.equal(res.status, 200)
    assert.equal(res.json.data.approvedBy.id, staff.admin.id)
  })

  test('422 sem motivo ou sem autorização, antes de qualquer outra checagem', async () => {
    const { picanha } = await orderInKitchen()
    assert.equal((await authorizedCancel(picanha, { reason: ' ', approver: approver() })).status, 422)
    assert.equal((await authorizedCancel(picanha, { reason: 'Erro' })).status, 422)
    assert.equal((await authorizedCancel(picanha, { reason: 'Erro', approver: { email: '', password: '' } })).status, 422)
    assert.equal((await authorizedCancel('999999', { reason: '', approver: approver() })).status, 422)
  })

  test('403 com a mesma mensagem para senha errada, inativo, papel sem gerência ou e-mail inexistente', async () => {
    const { orderId, picanha } = await orderInKitchen()
    const inactive = await createUser('manager', { name: 'Gerente antigo', email: 'antigo@mesafacil.com' })
    await query(`UPDATE users SET active = false WHERE id = $1`, [inactive.id])

    const attempts = [
      approver('manager', 'senha-errada'),
      { email: inactive.email, password: TEST_PASSWORD },
      approver('waiter'),
      approver('cashier'),
      approver('kitchen'),
      { email: 'ninguem@mesafacil.com', password: TEST_PASSWORD },
    ]
    for (const attempt of attempts) {
      // São 7 falhas seguidas: zera o limite de tentativas (RN-19, coberto em authThrottle.test.js).
      await query(`DELETE FROM auth_throttles`)
      const res = await authorizedCancel(picanha, { reason: 'Erro', approver: attempt })
      assert.equal(res.status, 403, JSON.stringify(attempt))
      assert.equal(res.json.error, INVALID)
    }

    // Autorização inválida vem antes do 404: não revela se o item existe.
    await query(`DELETE FROM auth_throttles`)
    const missing = await authorizedCancel('999999', { reason: 'Erro', approver: approver('manager', 'x') })
    assert.equal(missing.status, 403)

    // Nada mudou e a sessão do caixa continua válida.
    assert.equal((await bill(orderId)).items.length, 2)
    assert.equal((await api('GET', '/me', { role: 'cashier' })).status, 200)
  })

  test('a rota é só do caixa (e do admin): garçom, cozinha e gerente recebem 403; sem token, 401', async () => {
    const { picanha } = await orderInKitchen()
    const body = { reason: 'Erro', approver: approver() }
    for (const role of ['waiter', 'kitchen', 'manager']) {
      assert.equal((await authorizedCancel(picanha, body, role)).status, 403, role)
    }
    assert.equal((await authorizedCancel(picanha, body, null)).status, 401)
    assert.equal((await authorizedCancel(picanha, body, 'admin')).status, 200)
  })

  test('404 item inexistente; 409 item já cancelado e pedido encerrado', async () => {
    const body = { reason: 'Erro', approver: approver() }
    assert.equal((await authorizedCancel('999999', body)).status, 404)

    const { orderId, picanha, suco } = await orderInKitchen()
    assert.equal((await authorizedCancel(picanha, body)).status, 200)
    assert.equal((await authorizedCancel(picanha, body)).status, 409)

    // Encerra o pedido: suco pronto, conta pedida, pago e fechado.
    for (const status of ['preparing', 'ready']) {
      await api('PATCH', `/order-items/${suco}/status`, { role: 'kitchen', body: { status } })
    }
    await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'ready_to_pay' } })
    await pay(orderId, 10)
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'cashier', body: { status: 'closed' } })).status, 200)
    assert.equal((await authorizedCancel(suco, body)).status, 409)
  })

  test('409 quando o pago passaria do novo total; passa quando ainda cabe', async () => {
    const { orderId, picanha, suco } = await orderInKitchen()
    assert.equal((await pay(orderId, 50)).status, 201)

    // Sem a Picanha o total seria 10,00 < 50,00 pagos.
    const blocked = await authorizedCancel(picanha, { reason: 'Erro', approver: approver() })
    assert.equal(blocked.status, 409)
    assert.equal(blocked.json.error, OVERPAID)

    // Sem o Suco o total seria 89,90 ≥ 50,00.
    assert.equal((await authorizedCancel(suco, { reason: 'Erro', approver: approver() })).status, 200)
    assert.equal((await bill(orderId)).remainingBalance, 39.9)
  })

  test('a mesma trava vale para o PATCH /order-items/:id/status (RN-05 e item pendente)', async () => {
    const { orderId, picanha } = await orderInKitchen()
    await pay(orderId, 50)
    const rn05 = await api('PATCH', `/order-items/${picanha}/status`, {
      body: { status: 'canceled', reason: 'Sem estoque' },
    })
    assert.equal(rn05.status, 409)
    assert.equal(rn05.json.error, OVERPAID)

    // Pagamento parcial com o pedido ainda aberto e item pendente.
    const openOrder = (await api('POST', '/orders', { role: 'waiter', body: { tableId: tableIds[1] } })).json.data.id
    const pending = (
      await api('POST', `/orders/${openOrder}/items`, { role: 'waiter', body: { menuItemId: menu.suco } })
    ).json.data.id
    await pay(openOrder, 5)
    const removed = await api('PATCH', `/order-items/${pending}/status`, { role: 'waiter', body: { status: 'canceled' } })
    assert.equal(removed.status, 409)
    assert.equal(removed.json.error, OVERPAID)
  })
})
