import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Cashier from '../../src/pages/Cashier'
import Order from '../../src/pages/Order'
import Tables from '../../src/pages/Tables'
import { describeAudit } from '../../src/utils/auditLabels'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const waiter = { id: '2', name: 'Garçom', email: 'g@m.com', role: 'waiter' }
const cashier = { id: '3', name: 'Caixa', email: 'cx@m.com', role: 'cashier' }
const kitchen = { id: '5', name: 'Cozinha', email: 'k@m.com', role: 'kitchen' }
const TABLES = [
  { id: '1', number: 1, status: 'occupied', activeOrderId: '10', orderStatus: 'in_kitchen' },
  { id: '2', number: 2, status: 'available', activeOrderId: null, orderStatus: null },
  { id: '3', number: 3, status: 'occupied', activeOrderId: '30', orderStatus: 'ready_to_pay' },
]
const ok = (data) => jsonResponse({ success: true, data })

describe('Mesa aguardando pagamento e reabertura (spec 019)', () => {
  it('Salão: a mesa com a conta pedida mostra a tag, a legenda e a contagem', async () => {
    mockFetch({ 'GET /tables': TABLES, 'GET /shifts/active': () => ok({ id: '5', status: 'open' }) }, waiter)
    renderWithAuth(<Tables />, { user: waiter, route: '/tables', path: '/tables' })

    const awaiting = await screen.findByRole('button', { name: /MESA\s*Aguardando pagamento\s*3/ })
    expect(awaiting).toHaveClass('table-card', 'occupied', 'awaiting')
    expect(awaiting).toHaveTextContent('Conta pedida · ver comanda →')
    const busy = screen.getByRole('button', { name: /MESA\s*Ocupada\s*1/ })
    expect(busy).not.toHaveClass('awaiting')
    expect(screen.getByText('1 aguardando pagamento')).toBeInTheDocument()
    expect(document.querySelector('.legend')).toHaveTextContent('Aguardando pagamento')
  })

  it('Caixa: mesas aguardando pagamento vêm primeiro, com a tag; "Reabrir conta" chama a rota e recarrega', async () => {
    const reopened = []
    let status = 'ready_to_pay'
    const bill = () => ({
      orderId: '30', status, serviceTax: false, subtotal: 89.9, serviceTaxAmount: 0, total: 89.9, remainingBalance: 39.9,
      items: [{ id: '1', name: 'Picanha', quantity: 1, unitPrice: 89.9, status: 'ready' }],
      payments: [{ id: '1', amount: 50, changeAmount: 0, method: 'pix', createdAt: new Date().toISOString() }],
    })
    mockFetch(
      {
        'GET /tables': () => ok(TABLES.map((table) => (table.id === '3' ? { ...table, orderStatus: status } : table))),
        'GET /orders/30/bill': () => ok(bill()),
        'POST /orders/30/reopen': ({ body }) => {
          reopened.push(body)
          status = 'in_kitchen'
          return ok({ id: '30', status })
        },
        'GET /shifts/active': () => ok(null),
      },
      cashier,
    )
    renderWithAuth(<Cashier />, { user: cashier, route: '/cashier', path: '/cashier' })

    await waitFor(() => expect(document.querySelectorAll('.cash-table')).toHaveLength(2))
    const [first, second] = document.querySelectorAll('.cash-table')
    expect(first).toHaveTextContent('Mesa 3')
    expect(within(first).getByText('Aguardando pagamento')).toHaveClass('status-tag', 'awaiting')
    expect(second).toHaveTextContent('Mesa 1')
    expect(within(second).queryByText('Aguardando pagamento')).not.toBeInTheDocument()

    fireEvent.click(first)
    fireEvent.click(await screen.findByRole('button', { name: 'Reabrir conta' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reabrir a conta #30' })
    expect(within(dialog).getByLabelText('Motivo (opcional)')).not.toBeRequired()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reabrir conta' }))

    await waitFor(() => expect(reopened).toEqual([{ reason: null }]))
    expect(await screen.findByText('Conta da mesa 3 reaberta')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Na cozinha')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Reabrir conta' })).not.toBeInTheDocument()
    expect(document.querySelectorAll('.cash-table')[0]).toHaveTextContent('Mesa 1')
  })

  function renderOrder(user, reopen) {
    let status = 'ready_to_pay'
    const requests = []
    mockFetch(
      {
        'GET /orders/30': () =>
          ok({
            id: '30', status, createdAt: new Date().toISOString(), table: { number: 3 }, cancellation: null,
            items: [{ id: '1', name: 'Picanha', quantity: 1, unitPrice: 89.9, notes: null, status: 'ready' }],
          }),
        'GET /menu-items': [],
        'POST /orders/30/reopen': ({ body }) => {
          requests.push(body)
          const response = reopen()
          if (response.status === 200) status = 'in_kitchen'
          return response
        },
      },
      user,
    )
    renderWithAuth(<Order />, { user, route: '/orders/30', path: '/orders/:id' })
    return requests
  }

  it('Comanda: com a conta pedida, "Reabrir conta" no lugar de "Pedir a conta", com motivo opcional', async () => {
    const requests = renderOrder(waiter, () => ok({ id: '30', status: 'in_kitchen' }))
    expect(
      await screen.findByText('Conta pedida: o pagamento é feito no caixa. Reabra a conta para lançar mais itens.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pedir a conta' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reabrir conta' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reabrir a conta da mesa 3' })
    fireEvent.change(within(dialog).getByLabelText('Motivo (opcional)'), { target: { value: '  Sobremesa  ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reabrir conta' }))

    await waitFor(() => expect(requests).toEqual([{ reason: 'Sobremesa' }]))
    expect(await screen.findByText('Conta reaberta: já dá para lançar mais itens')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Pedir a conta' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Reabrir conta' })).not.toBeInTheDocument()
  })

  it('Comanda: o erro da API aparece dentro do modal', async () => {
    renderOrder(waiter, () =>
      jsonResponse({ success: false, error: 'Transição de status do pedido inválida.', code: 'CONFLICT' }, 409),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Reabrir conta' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reabrir a conta da mesa 3' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reabrir conta' }))
    expect(await within(dialog).findByText('Transição de status do pedido inválida.')).toBeInTheDocument()
  })

  it('Comanda: a cozinha não vê "Reabrir conta"', async () => {
    renderOrder(kitchen, () => ok({}))
    await screen.findByText(/Conta pedida/)
    expect(screen.queryByRole('button', { name: 'Reabrir conta' })).not.toBeInTheDocument()
  })

  it('auditoria descreve a reabertura, com "já pago" só quando houver pagamento', () => {
    const entry = (details) => ({
      id: '1', action: 'order.reopened', details, target: { orderId: '30', tableNumber: 3 },
    })
    expect(describeAudit(entry({ reason: 'Sobremesa', paidAmount: 50 }))).toEqual({
      title: 'Reabriu a conta',
      summary: expect.stringMatching(/^Pedido 30 · Mesa 3 · Motivo: Sobremesa · já pago R\$\s50,00$/),
    })
    expect(describeAudit(entry({ reason: null, paidAmount: 0 })).summary).toBe('Pedido 30 · Mesa 3')
  })
})
