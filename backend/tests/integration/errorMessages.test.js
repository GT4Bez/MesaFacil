import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb } from '../support/db.js'
import { createStaff, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'

describe('Mensagens de erro informativas (spec 021)', () => {
  let server
  let staff
  let tableIds
  let picanha

  const api = (method, path, { role = 'manager', body, token } = {}) =>
    server.api(method, path, { token: token ?? (role && staff[role].token), body })
  const errorOf = async (...args) => {
    const res = await api(...args)
    return { status: res.status, code: res.json?.code, error: res.json?.error }
  }
  const openOrder = async (tableId = tableIds[0]) =>
    (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
  const addItem = async (orderId) =>
    (await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: picanha } })).json.data.id
  const setStatus = (orderId, status, role = 'waiter', extra = {}) =>
    errorOf('PATCH', `/orders/${orderId}/status`, { role, body: { status, ...extra } })
  const kitchen = (itemId, status) => api('PATCH', `/order-items/${itemId}/status`, { role: 'kitchen', body: { status } })

  before(async () => {
    await setupSchema()
    server = await startServer()
  })
  after(() => server.close())
  beforeEach(async () => {
    await resetDb()
    staff = await createStaff()
    tableIds = await createTables(2)
    picanha = await createMenuItem({ name: 'Picanha na chapa', price: 89.9 })
  })

  test('sessão: sem login e sessão expirada falam a língua do usuário', async () => {
    assert.deepEqual(await errorOf('GET', '/tables', { role: null }), {
      status: 401, code: 'UNAUTHORIZED', error: 'Você não está logado. Faça login para continuar.',
    })
    assert.equal(
      (await errorOf('GET', '/tables', { token: 'token-quebrado' })).error,
      'Sua sessão expirou. Faça login novamente.',
    )
  })

  test('permissão: diz quem pode e com que papel a pessoa entrou', async () => {
    assert.deepEqual(await errorOf('POST', '/shifts', { role: 'waiter', body: { openingFloat: 0 } }), {
      status: 403, code: 'FORBIDDEN', error: 'Só Gerente pode fazer isto. Você entrou como Garçom.',
    })
    assert.equal(
      (await errorOf('POST', '/orders/1/payments', { role: 'kitchen', body: { amount: 1, method: 'pix' } })).error,
      'Só Caixa ou Gerente podem fazer isto. Você entrou como Cozinha.',
    )
    assert.equal(
      (await setStatus('1', 'closed', 'waiter')).error,
      'Só Caixa ou Gerente podem encerrar o pedido. Você entrou como Garçom.',
    )
    assert.equal(
      (await errorOf('GET', '/menu-items?all=true', { role: 'waiter' })).error,
      'Só Gerente pode ver os itens fora de linha.',
    )
  })

  test('turno fechado: diz quem abre e onde', async () => {
    assert.equal(
      (await errorOf('POST', '/orders', { role: 'waiter', body: { tableId: tableIds[0] } })).error,
      'Não há turno aberto. O gerente precisa abrir o turno (tela Turno) antes de iniciar atendimentos.',
    )
  })

  test('estado do pedido: status atual e próximo passo', async () => {
    await api('POST', '/shifts', { body: { openingFloat: 0 } })
    const orderId = await openOrder()
    const itemId = await addItem(orderId)
    const second = await addItem(orderId)
    await setStatus(orderId, 'in_kitchen')

    assert.equal(
      (await setStatus(orderId, 'ready_to_pay')).error,
      '2 itens ainda não estão prontos na cozinha. Peça a conta quando a cozinha terminar.',
    )
    await kitchen(itemId, 'preparing')
    await kitchen(itemId, 'ready')
    assert.equal(
      (await setStatus(orderId, 'ready_to_pay')).error,
      '1 item ainda não está pronto na cozinha. Peça a conta quando a cozinha terminar.',
    )
    // Item fora da sequência da cozinha.
    assert.equal(
      (await errorOf('PATCH', `/order-items/${second}/status`, { role: 'kitchen', body: { status: 'ready' } })).error,
      'O item está "Enviado" e não pode passar para "Pronto". A sequência na cozinha é Enviado → Em preparo → Pronto.',
    )
    await kitchen(second, 'preparing')
    await kitchen(second, 'ready')
    assert.equal((await setStatus(orderId, 'ready_to_pay')).status, 200)

    // Conta pedida: nem itens novos nem volta para a cozinha sem reabrir.
    assert.equal(
      (await errorOf('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: picanha } })).error,
      'A conta já foi pedida (Aguardando pagamento). Reabra a conta para lançar mais itens.',
    )
    assert.equal(
      (await setStatus(orderId, 'in_kitchen')).error,
      'O pedido está "Aguardando pagamento" e não pode passar para "Na cozinha". Reabra a conta para voltar ao atendimento.',
    )

    // Saldo em aberto com o valor que falta.
    await api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount: 100, method: 'pix' } })
    assert.equal(
      (await setStatus(orderId, 'closed', 'cashier')).error,
      'Ainda faltam R$ 79,80 para quitar o pedido. Registre o pagamento antes de encerrar.',
    )
    await api('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount: 79.8, method: 'card' } })
    assert.equal((await setStatus(orderId, 'closed', 'cashier')).status, 200)

    // Pedido encerrado.
    assert.equal(
      (await errorOf('POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount: 1, method: 'pix' } })).error,
      'Não dá para registrar pagamento: o pedido está "Encerrado".',
    )
    assert.equal(
      (await errorOf('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: picanha } })).error,
      'O pedido está "Encerrado". Abra um novo atendimento na mesa para lançar itens.',
    )
    assert.equal(
      (await setStatus(orderId, 'canceled', 'manager', { reason: 'Teste' })).error,
      'O pedido está "Encerrado" e não pode passar para "Cancelado". O atendimento já terminou.',
    )
  })

  test('validação: diz o formato esperado', async () => {
    await api('POST', '/shifts', { body: { openingFloat: 0 } })
    const orderId = await openOrder()
    const expectations = [
      [['POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: picanha, quantity: 0 } }],
        'A quantidade deve ser um número inteiro maior que zero.'],
      [['POST', `/orders/${orderId}/payments`, { role: 'cashier', body: { amount: 10, method: 'cheque' } }],
        'Forma de pagamento inválida: use Dinheiro, Cartão ou Pix.'],
      [['PATCH', `/menu-items/${picanha}`, { body: { price: -1 } }],
        'O preço deve ser um número de R$ 0,00 a R$ 99.999.999,99.'],
      [['POST', '/users', { role: 'admin', body: { name: 'Ana', email: 'ana@m.com', password: '12345678', role: 'chef' } }],
        'Papel inválido: use admin (Administrador), waiter (Garçom), kitchen (Cozinha), cashier (Caixa) ou manager (Gerente).'],
      [['POST', '/users', { role: 'admin', body: { name: 'Ana', email: 'ana', password: '12345678', role: 'waiter' } }],
        'E-mail inválido: use o formato nome@dominio.com (até 255 caracteres).'],
      [['GET', '/audit-logs?from=2026-11-23T10:00:00Z&to=2026-11-23T09:00:00Z'],
        'A data inicial deve ser anterior à data final.'],
      [['GET', '/audit-logs?shiftId=abc'], 'O turno (shiftId) deve ser um número inteiro maior que zero.'],
      [['GET', '/audit-logs?limit=500'], 'A quantidade por página (limit) deve ser um número inteiro de 1 a 100.'],
    ]
    for (const [args, message] of expectations) {
      const res = await errorOf(...args)
      assert.equal(res.error, message, args[1])
    }
  })

  test('erros do banco e JSON quebrado viram mensagens específicas', async () => {
    const res = await server.api('POST', '/auth/login', { body: '{"email": ', headers: { 'Content-Type': 'application/json' } })
    assert.equal(res.status, 400)
    assert.equal(res.json.error, 'O corpo da requisição não é um JSON válido. Confira vírgulas, aspas e chaves.')

    const bad = await errorOf('GET', '/orders/abc')
    assert.equal(bad.status, 400)
    assert.equal(bad.error, 'Um identificador ou valor veio em formato inválido (por exemplo, letras onde se espera um número).')
  })
})
