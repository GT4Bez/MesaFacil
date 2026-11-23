import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupSchema, resetDb, query } from '../support/db.js'
import { createStaff, createTables, createMenuItem } from '../support/factories.js'
import { startServer } from '../support/server.js'
import { IngredientService } from '../../src/services/IngredientService.js'

const HEADER = 'id;data;tipo;quantidade;unidade;custo_unitario;saldo_depois;quem_lancou;motivo;turno;pedido;mesa;item_vendido;qtd_vendida'

describe('Histórico do insumo por período, turno e CSV (spec 018)', () => {
  let server
  let staff
  let tableIds
  let picanha
  let carne
  let shiftId

  const api = (method, path, { role = 'manager', body } = {}) =>
    server.api(method, path, { token: role && staff[role].token, body })
  const history = (params = '', role = 'manager', id = carne.id) => api('GET', `/ingredients/${id}/movements${params}`, { role })
  const csv = async (params = '', role = 'manager', id = carne.id) => {
    const res = await fetch(`${server.base}/ingredients/${id}/movements.csv${params}`, {
      headers: role ? { Authorization: `Bearer ${staff[role].token}` } : {},
    })
    const body = Buffer.from(await res.arrayBuffer())
    const isCsv = res.headers.get('content-type')?.startsWith('text/csv')
    return { status: res.status, headers: res.headers, body, text: body.toString('utf8'), json: isCsv ? null : JSON.parse(body) }
  }
  const range = (from, to) =>
    `?${[from && `from=${encodeURIComponent(from)}`, to && `to=${encodeURIComponent(to)}`].filter(Boolean).join('&')}`

  async function purchase(quantity, at) {
    assert.equal((await api('POST', `/ingredients/${carne.id}/purchases`, { body: { quantity, unitCost: 79.9 } })).status, 201)
    return stamp(at)
  }
  // Data do último movimento do insumo, para testar o período sem depender do relógio.
  async function stamp(at) {
    const { rows } = await query(
      `UPDATE stock_movements SET created_at = $2
       WHERE id = (SELECT max(id) FROM stock_movements WHERE ingredient_id = $1)
       RETURNING id::text`,
      [carne.id, at],
    )
    return rows[0].id
  }
  async function sell(quantity, tableId, at) {
    const orderId = (await api('POST', '/orders', { role: 'waiter', body: { tableId } })).json.data.id
    await api('POST', `/orders/${orderId}/items`, { role: 'waiter', body: { menuItemId: picanha, quantity } })
    assert.equal((await api('PATCH', `/orders/${orderId}/status`, { role: 'waiter', body: { status: 'in_kitchen' } })).status, 200)
    await stamp(at)
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
    tableIds = await createTables(3)
    shiftId = (await api('POST', '/shifts', { body: { openingFloat: 0 } })).json.data.id
    picanha = await createMenuItem({ name: 'Picanha na chapa', price: 89.9 })
    carne = (await api('POST', '/ingredients', { body: { name: 'Picanha', unit: 'kg', minStock: 2, unitCost: 70 } })).json.data
    await api('PUT', `/menu-items/${picanha}/recipe`, { body: { items: [{ ingredientId: carne.id, quantity: 0.3 }] } })
  })

  test('período (to exclusivo) com tipo e paginação; saldo igual ao sem filtro; resumo do recorte inteiro', async () => {
    await purchase(10, '2026-11-20T10:00:00-03:00')
    await sell(1, tableIds[0], '2026-11-21T12:00:00-03:00')
    await sell(2, tableIds[1], '2026-11-21T20:00:00-03:00')
    await purchase(1.5, '2026-11-21T22:00:00-03:00')
    await sell(1, tableIds[2], '2026-11-22T00:00:00-03:00')

    const all = (await history()).json.data
    assert.equal(all.summary, null)
    const balanceById = Object.fromEntries(all.movements.map((m) => [m.id, m.balanceAfter]))

    const day = range('2026-11-21T00:00:00-03:00', '2026-11-22T00:00:00-03:00')
    const res = (await history(`${day}&limit=1`)).json.data
    assert.equal(res.movements.length, 1)
    assert.equal(res.movements[0].type, 'purchase')
    assert.equal(res.movements[0].balanceAfter, balanceById[res.movements[0].id])
    assert.equal(res.movements[0].balanceAfter, 10.6)
    assert.deepEqual(res.summary, { count: 3, in: 1.5, out: -0.9, net: 0.6 })

    // Paginação no recorte: não repete nem pula.
    const seen = [...res.movements]
    let cursor = res.nextBefore
    while (cursor) {
      const page = (await history(`${day}&limit=1&before=${cursor}`)).json.data
      assert.deepEqual(page.summary, res.summary)
      seen.push(...page.movements)
      cursor = page.nextBefore
    }
    assert.deepEqual(seen.map((m) => [m.type, m.quantity]), [['purchase', 1.5], ['sale', -0.6], ['sale', -0.3]])
    seen.forEach((m) => assert.equal(m.balanceAfter, balanceById[m.id]))

    // Combinado com tipo; o mesmo instante em UTC; só `from`.
    const sales = (await history(`${day}&type=sale`)).json.data
    assert.deepEqual(sales.movements.map((m) => m.quantity), [-0.6, -0.3])
    assert.deepEqual(sales.summary, { count: 2, in: 0, out: -0.9, net: -0.9 })
    const utc = (await history(range('2026-11-21T03:00:00Z', '2026-11-22T03:00:00Z'))).json.data
    assert.equal(utc.summary.count, 3)
    assert.equal((await history(range('2026-11-22T00:00:00-03:00'))).json.data.summary.count, 1)

    // Só o tipo já é filtro; recorte vazio vem zerado.
    assert.deepEqual((await history('?type=adjustment')).json.data.summary, { count: 0, in: 0, out: 0, net: 0 })
  })

  test('turno: só os movimentos daquele turno; turno inexistente → lista vazia', async () => {
    await purchase(5, '2026-11-20T10:00:00-03:00')
    await query(`UPDATE stock_movements SET shift_id = NULL WHERE ingredient_id = $1`, [carne.id])
    await sell(1, tableIds[0], '2026-11-21T12:00:00-03:00')

    const res = (await history(`?shiftId=${shiftId}`)).json.data
    assert.deepEqual(res.movements.map((m) => [m.type, m.shiftId, m.balanceAfter]), [['sale', shiftId, 4.7]])
    assert.deepEqual(res.summary, { count: 1, in: 0, out: -0.3, net: -0.3 })
    const none = (await history('?shiftId=999999')).json.data
    assert.deepEqual([none.movements, none.summary], [[], { count: 0, in: 0, out: 0, net: 0 }])
  })

  test('validação → 422 na lista e no CSV', async () => {
    const invalid = [
      '?from=2026-11-23', '?from=2026-11-23T00:00:00', '?to=2026-02-30T00:00:00Z', '?from=2026-11-23T25:00:00Z',
      range('2026-11-23T00:00:00-03:00', '2026-11-23T00:00:00-03:00'),
      range('2026-11-24T00:00:00Z', '2026-11-23T00:00:00Z'),
      '?shiftId=abc', '?shiftId=0', '?shiftId=1.5', '?shiftId=1&shiftId=2', '?type=expense',
    ]
    for (const params of invalid) {
      const list = await history(params)
      assert.equal(list.status, 422, params)
      assert.equal(list.json.code, 'VALIDATION_ERROR', params)
      const file = await csv(params)
      assert.equal(file.status, 422, `csv ${params}`)
      assert.equal(file.json.code, 'VALIDATION_ERROR', `csv ${params}`)
    }
  })

  test('CSV: cabeçalho, BOM, `;`, vírgula decimal, \\r\\n, ordem e nome do arquivo', async () => {
    const feijao = (await api('POST', '/ingredients', { body: { name: 'Feijão  Preto (Ação)', unit: 'kg', minStock: 0, unitCost: 8 } })).json.data
    const empty = await csv('', 'manager', feijao.id)
    assert.equal(empty.status, 200)
    const today = new Date()
    const date = [today.getFullYear(), today.getMonth() + 1, today.getDate()].map((n) => String(n).padStart(2, '0')).join('-')
    assert.equal(empty.headers.get('content-disposition'), `attachment; filename="historico-feijao-preto-acao-${date}.csv"`)
    assert.equal(empty.text, `﻿${HEADER}\r\n`)

    await purchase(5, '2026-11-23T19:00:00-03:00')
    await api('POST', `/ingredients/${carne.id}/adjustments`, { body: { countedQuantity: 4.85, reason: 'Aparas' } })
    await stamp('2026-11-23T19:30:00-03:00')
    const orderId = await sell(2, tableIds[1], '2026-11-23T19:42:10-03:00')

    const file = await csv()
    assert.equal(file.status, 200)
    assert.equal(file.headers.get('content-type'), 'text/csv; charset=utf-8')
    assert.deepEqual([...file.body.subarray(0, 3)], [0xef, 0xbb, 0xbf])
    assert.ok(file.text.endsWith('\r\n'))
    const lines = file.text.slice(1).split('\r\n')
    assert.equal(lines.pop(), '')
    assert.equal(lines[0], HEADER)
    const ids = (await history()).json.data.movements.map((m) => m.id).reverse()
    assert.deepEqual(lines.slice(1), [
      `${ids[0]};2026-11-23T22:00:00.000Z;entrada;5;kg;79,9;5;Gerente;;${shiftId};;;;`,
      `${ids[1]};2026-11-23T22:30:00.000Z;ajuste;-0,15;kg;79,9;4,85;Gerente;Aparas;${shiftId};;;;`,
      `${ids[2]};2026-11-23T22:42:10.000Z;venda;-0,6;kg;79,9;4,25;Garçom;;${shiftId};${orderId};2;Picanha na chapa;2`,
    ])

    // Os filtros valem no CSV, sem limit nem before.
    const sales = (await csv(`?type=sale&shiftId=${shiftId}`)).text.slice(1).split('\r\n')
    assert.deepEqual(sales.slice(1, -1).map((line) => line.split(';')[2]), ['venda'])
    assert.equal((await csv('?limit=1')).status, 200)
  })

  test('CSV: texto livre começando como fórmula recebe `\'`; `;`, aspas e quebra de linha vão entre aspas', async () => {
    await purchase(10, '2026-11-23T10:00:00-03:00')
    const reasons = ['=1+1', 'Quebra; "caixa" molhada', '-2 kg\nna limpeza', '@SOMA', '+5']
    let count = 10
    for (const reason of reasons) {
      count -= 1
      assert.equal((await api('POST', `/ingredients/${carne.id}/adjustments`, { body: { countedQuantity: count, reason } })).status, 201)
    }
    await query(`UPDATE users SET name = '=HYPERLINK("x")' WHERE id = $1`, [staff.manager.id])

    const lines = (await csv('?type=adjustment')).text.slice(1).split('\r\n').slice(1, -1)
    const field = (line, index) => line.split(';')[index]
    assert.equal(field(lines[0], 8), "'=1+1")
    assert.equal(field(lines[0], 7), `"'=HYPERLINK(""x"")"`)
    assert.ok(lines[1].includes(';"Quebra; ""caixa"" molhada";'))
    assert.ok(lines[2].includes(`;"'-2 kg\nna limpeza";`))
    assert.equal(field(lines[3], 8), "'@SOMA")
    assert.equal(field(lines[4], 8), "'+5")
    // Coluna numérica negativa não ganha o prefixo.
    assert.equal(field(lines[4], 3), '-1')
  })

  test('CSV: acesso e erros no envelope JSON; admin → 200', async () => {
    const anonymous = await csv('', null)
    assert.equal(anonymous.status, 401)
    assert.equal(anonymous.json.success, false)
    for (const role of ['waiter', 'cashier', 'kitchen']) {
      const res = await csv('', role)
      assert.equal(res.status, 403, role)
      assert.equal(res.json.code, 'FORBIDDEN', role)
    }
    const missing = await csv('', 'manager', '999999')
    assert.equal(missing.status, 404)
    assert.equal(missing.json.success, false)
    assert.equal((await csv('', 'admin')).status, 200)

    // O frontend roda em outra origem: o nome do arquivo precisa ser exposto pelo CORS.
    const cross = await fetch(`${server.base}/ingredients/${carne.id}/movements.csv`, {
      headers: { Authorization: `Bearer ${staff.manager.token}`, Origin: 'http://localhost:5173' },
    })
    assert.match(cross.headers.get('access-control-expose-headers') ?? '', /Content-Disposition/i)
  })

  test('CSV: acima do limite de linhas → 422 (limite injetado no service)', async () => {
    for (let i = 0; i < 3; i++) await purchase(1, `2026-11-2${i}T10:00:00-03:00`)
    const service = new IngredientService(undefined, undefined, undefined, undefined, { csvLimit: 2 })
    await assert.rejects(service.exportMovements(carne.id, {}), (error) => {
      assert.equal(error.statusCode ?? error.status, 422)
      assert.equal(error.message, 'O recorte tem mais de 2 movimentos. Diminua o período.')
      return true
    })
    const ok = await service.exportMovements(carne.id, { from: '2026-11-21T00:00:00-03:00' })
    assert.equal(ok.csv.split('\r\n').length, 4)

    const big = new IngredientService()
    assert.equal(big.csvLimit, 10000)
    await assert.rejects(
      new IngredientService(undefined, undefined, undefined, undefined, { csvLimit: 10000 }).exportMovements(carne.id, { from: 'x' }),
      /from deve ser/,
    )
  })
})
