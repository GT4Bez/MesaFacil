import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Order from '../../src/pages/Order'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const cashier = { id: '4', name: 'Caixa', email: 'c@m.com', role: 'cashier' }

function renderOrder(status) {
  const order = {
    id: '10',
    status,
    createdAt: new Date().toISOString(),
    table: { number: 4 },
    cancellation: null,
    items: [
      { id: '21', name: 'Picanha', quantity: 2, unitPrice: 89.9, notes: null, status: 'pending' },
    ],
  }
  const fetchSpy = mockFetch(
    { 'GET /orders/10': () => jsonResponse({ success: true, data: order }) },
    cashier,
  )
  renderWithAuth(<Order />, { user: cashier, route: '/orders/10', path: '/orders/:id' })
  return fetchSpy
}

describe('Comanda: modo leitura para o caixa (RBAC)', () => {
  it('oculta cardápio, edição de itens, envio à cozinha e pedir conta, exibindo atalho para o Caixa', async () => {
    const fetchSpy = renderOrder('open')

    expect(await screen.findByText('Picanha')).toBeInTheDocument()
    expect(screen.getByText('Qtd. 2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ir para o Caixa/ })).toHaveAttribute('href', '/cashier')

    expect(screen.queryByRole('heading', { name: 'Cardápio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Enviar para a cozinha/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pedir a conta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover item' })).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringMatching(/\/menu-items$/), expect.anything())
  })

  it('mantém o botão Reabrir conta quando o pedido está aguardando pagamento (spec 019)', async () => {
    renderOrder('ready_to_pay')

    expect(await screen.findByRole('button', { name: 'Reabrir conta' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ir para o Caixa/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cardápio' })).not.toBeInTheDocument()
  })
})
