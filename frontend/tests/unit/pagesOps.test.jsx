import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Cashier from '../../src/pages/Cashier'
import Kitchen from '../../src/pages/Kitchen'
import Order from '../../src/pages/Order'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

describe('Telas Operacionais (KDS, Comanda e Caixa)', () => {
  it('Kitchen carrega fila e exibe erro quando transição falha', async () => {
    const user = { id: '2', name: 'Cozinha', email: 'c@m.com', role: 'kitchen' }
    const queue = [
      {
        orderId: '5',
        table: { number: 2 },
        items: [{ id: '11', name: 'Picanha', quantity: 1, notes: 'mal passada', status: 'sent', sentAt: new Date().toISOString() }],
      },
    ]
    mockFetch(
      {
        'GET /kitchen/orders': queue,
        'PATCH /order-items/11/status': () => jsonResponse({ success: false, error: 'Transição inválida.' }, 409),
      },
      user,
    )

    renderWithAuth(<Kitchen />, { user, route: '/kitchen', path: '/kitchen' })
    expect(await screen.findByText('Mesa 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar preparo' }))
    expect(await screen.findByText('Transição inválida.')).toBeInTheDocument()
  })

  it('Order habilita Pedir a conta só com itens ready e permite gerente cancelar pedido com motivo', async () => {
    const manager = { id: '4', name: 'Gerente', email: 'ger@m.com', role: 'manager' }
    let orderState = {
      id: '10',
      status: 'in_kitchen',
      createdAt: new Date().toISOString(),
      table: { number: 4 },
      cancellation: null,
      items: [{ id: '21', name: 'Suco', quantity: 1, unitPrice: 10, notes: null, status: 'ready' }],
    }
    const fetchSpy = mockFetch(
      {
        'GET /orders/10': () => jsonResponse({ success: true, data: orderState }),
        'GET /menu-items': [],
        'PATCH /orders/10/status': ({ body }) => {
          orderState = {
            ...orderState,
            status: body.status,
            cancellation: body.reason ? { reason: body.reason, canceledBy: { name: 'Gerente' } } : null,
          }
          return jsonResponse({ success: true, data: { id: '10', status: body.status } })
        },
      },
      manager,
    )

    renderWithAuth(<Order />, { user: manager, route: '/orders/10', path: '/orders/:id' })
    expect(await screen.findByRole('button', { name: 'Pedir a conta' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Mesa errada' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar pedido' }))

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/orders\/10\/status$/),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'canceled', reason: 'Mesa errada' }),
        }),
      ),
    )
  })

  it('Cashier persiste taxa via PATCH, limita Pix ao saldo e exibe troco em dinheiro (RN-12)', async () => {
    const cashier = { id: '3', name: 'Caixa', email: 'cx@m.com', role: 'cashier' }
    let serviceTax = true
    let remainingBalance = 110
    const buildBill = () => ({
      orderId: '7',
      serviceTax,
      subtotal: 100,
      serviceTaxAmount: serviceTax ? 10 : 0,
      total: serviceTax ? 110 : 100,
      remainingBalance,
      items: [{ id: '1', name: 'Prato', quantity: 1, unitPrice: 100 }],
      payments: [],
    })
    const fetchSpy = mockFetch(
      {
        'GET /tables': [{ id: '1', number: 1, status: 'occupied', activeOrderId: '7' }],
        'GET /orders/7/bill': () => jsonResponse({ success: true, data: buildBill() }),
        'PATCH /orders/7/service-tax': ({ body }) => {
          serviceTax = body.enabled
          remainingBalance = serviceTax ? 110 : 100
          return jsonResponse({ success: true, data: buildBill() })
        },
        'POST /orders/7/payments': ({ body }) => {
          const changeAmount = body.amount > remainingBalance ? body.amount - remainingBalance : 0
          remainingBalance = Math.max(0, remainingBalance - body.amount)
          return jsonResponse({ success: true, data: { id: '50', amount: body.amount, changeAmount } }, 201)
        },
      },
      cashier,
    )

    renderWithAuth(<Cashier />, { user: cashier, route: '/cashier', path: '/cashier' })
    fireEvent.click(await screen.findByRole('button', { name: /Mesa 1/i }))
    expect(await screen.findByText('Total da conta')).toBeInTheDocument()

    // Desliga taxa persistida
    fireEvent.click(screen.getByLabelText(/Incluir 10% de taxa de serviço/i))
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/orders\/7\/service-tax$/),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ enabled: false }) }),
      ),
    )

    // Pix acima do saldo (100) faz clamp automático no input
    fireEvent.change(screen.getByLabelText(/Forma de pagamento/i), { target: { value: 'pix' } })
    const amountInput = screen.getByLabelText(/Valor \(R\$\)/i)
    fireEvent.change(amountInput, { target: { value: '150' } })
    expect(amountInput).toHaveValue(100)

    // Dinheiro acima do saldo mostra troco estimado e confirma troco devolvido
    fireEvent.change(screen.getByLabelText(/Forma de pagamento/i), { target: { value: 'cash' } })
    fireEvent.change(amountInput, { target: { value: '120' } })
    expect(screen.getByText(/Troco estimado: R\$\s*20,00/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar pagamento' }))
    expect(await screen.findByText(/Pagamento registrado com sucesso! Troco: R\$\s*20,00/)).toBeInTheDocument()
  })
})
