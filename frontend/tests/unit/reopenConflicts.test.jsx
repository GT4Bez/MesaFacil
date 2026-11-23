import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Cashier from '../../src/pages/Cashier'
import Order from '../../src/pages/Order'
import { reopenConflictMessage } from '../../src/utils/reopen'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const waiter = { id: '2', name: 'Garçom', email: 'g@m.com', role: 'waiter' }
const cashier = { id: '3', name: 'Caixa', email: 'cx@m.com', role: 'cashier' }
const ok = (data) => jsonResponse({ success: true, data })
const conflict = () =>
  jsonResponse({ success: false, error: 'Transição de status do pedido inválida.', code: 'CONFLICT' }, 409)

// Caixa com a mesa 3 (pedido 30). `server.status` é o status real no backend; `server.reopen` responde ao POST.
function renderCashier(server) {
  const posts = []
  mockFetch(
    {
      'GET /tables': () =>
        ok([{ id: '3', number: 3, status: 'occupied', activeOrderId: '30', orderStatus: server.status }]),
      'GET /orders/30/bill': () =>
        ok({
          orderId: '30', status: server.status, serviceTax: false, subtotal: 89.9, serviceTaxAmount: 0, total: 89.9,
          remainingBalance: 89.9, items: [{ id: '1', name: 'Picanha', quantity: 1, unitPrice: 89.9, status: 'ready' }],
          payments: [],
        }),
      'POST /orders/30/reopen': ({ body }) => {
        posts.push(body)
        return server.reopen()
      },
      'GET /shifts/active': () => ok(null),
    },
    cashier,
  )
  renderWithAuth(<Cashier />, { user: cashier, route: '/cashier', path: '/cashier' })
  return posts
}

async function openCashierReopen() {
  fireEvent.click(await screen.findByRole('button', { name: /Mesa 3/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Reabrir conta' }))
  return screen.findByRole('dialog', { name: 'Reabrir a conta #30' })
}

describe('Reabertura: erros e conflitos (spec 019, QA)', () => {
  it('Caixa: 409 com a conta ainda aguardando pagamento mantém o modal aberto com o erro', async () => {
    const server = { status: 'ready_to_pay', reopen: conflict }
    renderCashier(server)
    const dialog = await openCashierReopen()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reabrir conta' }))
    expect(await within(dialog).findByText('Transição de status do pedido inválida.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Reabrir a conta #30' })).toBeInTheDocument()
  })

  it('Caixa: se o garçom reabriu antes (409), o extrato é recarregado, o modal fecha e avisa', async () => {
    const server = { status: 'ready_to_pay' }
    server.reopen = () => {
      server.status = 'in_kitchen' // outra pessoa reabriu entre a abertura do modal e o clique
      return conflict()
    }
    renderCashier(server)
    const dialog = await openCashierReopen()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reabrir conta' }))

    expect(await screen.findByText('A conta já tinha sido reaberta por outra pessoa.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Na cozinha')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reabrir conta' })).not.toBeInTheDocument()
    expect(within(document.querySelector('.cash-table')).queryByText('Aguardando pagamento')).not.toBeInTheDocument()
  })

  it('Comanda: se o caixa reabriu antes (409), a comanda é recarregada e o botão volta a ser "Pedir a conta"', async () => {
    let status = 'ready_to_pay'
    mockFetch(
      {
        'GET /orders/30': () =>
          ok({
            id: '30', status, createdAt: new Date().toISOString(), table: { number: 3 }, cancellation: null,
            items: [{ id: '1', name: 'Picanha', quantity: 1, unitPrice: 89.9, notes: null, status: 'ready' }],
          }),
        'GET /menu-items': [],
        'POST /orders/30/reopen': () => {
          status = 'in_kitchen'
          return conflict()
        },
      },
      waiter,
    )
    renderWithAuth(<Order />, { user: waiter, route: '/orders/30', path: '/orders/:id' })
    fireEvent.click(await screen.findByRole('button', { name: 'Reabrir conta' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reabrir a conta da mesa 3' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reabrir conta' }))

    expect(await screen.findByText('A conta já tinha sido reaberta por outra pessoa.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Pedir a conta' })).toBeEnabled()
    expect(screen.queryByText('Transição de status do pedido inválida.')).not.toBeInTheDocument()
  })

  it('o limite de 200 caracteres vale para o motivo sem os espaços das pontas, como na API', async () => {
    const server = { status: 'ready_to_pay', reopen: () => ok({ id: '30', status: 'in_kitchen' }) }
    const posts = renderCashier(server)
    const dialog = await openCashierReopen()
    const field = within(dialog).getByLabelText('Motivo (opcional)')

    fireEvent.change(field, { target: { value: 'x'.repeat(201) } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reabrir conta' }))
    expect(field.validationMessage).toBe('Use até 200 caracteres (hoje: 201).')
    expect(posts).toEqual([])

    fireEvent.input(field, { target: { value: `   ${'x'.repeat(200)}   ` } })
    expect(field.validationMessage).toBe('')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reabrir conta' }))
    await waitFor(() => expect(posts).toEqual([{ reason: 'x'.repeat(200) }]))
  })

  it('reopenConflictMessage explica o status recarregado', () => {
    expect(reopenConflictMessage('ready_to_pay')).toBeNull()
    expect(reopenConflictMessage(undefined)).toBeNull()
    expect(reopenConflictMessage('in_kitchen')).toBe('A conta já tinha sido reaberta por outra pessoa.')
    expect(reopenConflictMessage('closed')).toBe('A conta não pode mais ser reaberta: o pedido está encerrado.')
    expect(reopenConflictMessage('canceled')).toBe('A conta não pode mais ser reaberta: o pedido está cancelado.')
  })
})
