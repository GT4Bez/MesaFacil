import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Cashier from '../../src/pages/Cashier'
import Order from '../../src/pages/Order'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const waiter = { id: '2', name: 'Garçom', email: 'g@m.com', role: 'waiter' }
const cashier = { id: '3', name: 'Caixa', email: 'cx@m.com', role: 'cashier' }
const item = (id, status) => ({ id, name: `Item ${id}`, quantity: 1, unitPrice: 10, notes: null, status })

function renderOrder(status, items) {
  const order = { id: '10', status, createdAt: new Date().toISOString(), table: { number: 4 }, cancellation: null, items }
  mockFetch({ 'GET /orders/10': () => jsonResponse({ success: true, data: order }), 'GET /menu-items': [] }, waiter)
  renderWithAuth(<Order />, { user: waiter, route: '/orders/10', path: '/orders/:id' })
}

describe('O que falta para pedir e encerrar a conta (issue #106)', () => {
  it('comanda com itens pendentes pede para enviar à cozinha', async () => {
    renderOrder('open', [item('1', 'pending'), item('2', 'pending')])
    expect(await screen.findByText('Envie 2 itens pendentes para a cozinha antes de pedir a conta.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pedir a conta' })).toBeDisabled()
  })

  it('comanda na cozinha mostra quantos itens faltam ficar prontos', async () => {
    renderOrder('in_kitchen', [item('1', 'ready'), item('2', 'sent'), item('3', 'preparing'), item('4', 'canceled')])
    expect(await screen.findByText('Aguardando a cozinha: 2 itens ainda não estão prontos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pedir a conta' })).toBeDisabled()
  })

  it('comanda com a cozinha concluída libera o botão sem aviso', async () => {
    renderOrder('in_kitchen', [item('1', 'ready')])
    expect(await screen.findByRole('button', { name: 'Pedir a conta' })).toBeEnabled()
    expect(screen.queryByText(/Aguardando a cozinha|Envie/)).not.toBeInTheDocument()
  })

  it('caixa: pedido quitado mas ainda na cozinha não pode ser finalizado e explica por quê', async () => {
    const bill = {
      orderId: '7', status: 'in_kitchen', serviceTax: false, subtotal: 10, serviceTaxAmount: 0, total: 10,
      remainingBalance: 0, items: [{ id: '1', name: 'Suco', quantity: 1, unitPrice: 10 }],
      payments: [{ id: '1', amount: 10, changeAmount: 0, method: 'pix', createdAt: new Date().toISOString() }],
    }
    mockFetch(
      {
        'GET /tables': [{ id: '1', number: 1, status: 'occupied', activeOrderId: '7' }],
        'GET /shifts/active': () => jsonResponse({ success: true, data: null }),
        'GET /orders/7/bill': () => jsonResponse({ success: true, data: bill }),
      },
      cashier,
    )
    renderWithAuth(<Cashier />, { user: cashier, route: '/cashier', path: '/cashier' })
    fireEvent.click(await screen.findByRole('button', { name: /Mesa 1/ }))
    expect(await screen.findByText('Na cozinha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finalizar pedido e liberar mesa' })).toBeDisabled()
    expect(screen.getByText(/O garçom ainda não pediu a conta/)).toBeInTheDocument()
  })
})
