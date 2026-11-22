import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Order from '../../src/pages/Order'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const waiter = { id: '2', name: 'Garçom', email: 'g@m.com', role: 'waiter' }
const menu = [{ id: '1', name: 'Picanha', category: 'Pratos', price: 89.9 }]

function setup({ items = [], post } = {}) {
  let order = { id: '10', status: 'open', createdAt: new Date().toISOString(), table: { number: 4 }, cancellation: null, items }
  const fetchSpy = mockFetch(
    {
      'GET /orders/10': () => jsonResponse({ success: true, data: order }),
      'GET /menu-items': menu,
      'POST /orders/10/items':
        post ??
        (({ body }) => {
          order = { ...order, items: [...order.items, { id: '30', name: 'Picanha', quantity: body.quantity, unitPrice: 89.9, notes: body.notes, status: 'pending' }] }
          return jsonResponse({ success: true, data: { id: '30' } }, 201)
        }),
      'PATCH /order-items/21/quantity': ({ body }) => {
        order = { ...order, items: order.items.map((item) => ({ ...item, quantity: body.quantity })) }
        return jsonResponse({ success: true, data: { id: '21' } })
      },
    },
    waiter,
  )
  renderWithAuth(<Order />, { user: waiter, route: '/orders/10', path: '/orders/:id' })
  return fetchSpy
}

describe('Comanda: adicionar item em modal (spec 012)', () => {
  it('o card abre o modal; −/+ atualiza o total; adicionar envia e mostra o aviso', async () => {
    const fetchSpy = setup()
    fireEvent.click(await screen.findByRole('button', { name: /Picanha/ }))

    const dialog = screen.getByRole('dialog', { name: 'Picanha' })
    const add = within(dialog).getByRole('button', { name: /Adicionar à comanda/ })
    expect(add).toHaveTextContent(/R\$\s*89,90/)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aumentar quantidade' }))
    expect(add).toHaveTextContent(/R\$\s*179,80/)

    fireEvent.change(within(dialog).getByLabelText('Observação'), { target: { value: 'ao ponto' } })
    fireEvent.click(add)

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/orders\/10\/items$/),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ menuItemId: '1', quantity: 2, notes: 'ao ponto' }) }),
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('2× Picanha adicionado à comanda')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('ao ponto')).toBeInTheDocument()
  })

  it('erro da API aparece dentro do modal, que continua aberto', async () => {
    setup({ post: () => jsonResponse({ success: false, error: 'Item indisponível.' }, 422) })
    fireEvent.click(await screen.findByRole('button', { name: /Picanha/ }))
    const dialog = screen.getByRole('dialog', { name: 'Picanha' })
    fireEvent.click(within(dialog).getByRole('button', { name: /Adicionar à comanda/ }))
    expect(await within(dialog).findByText('Item indisponível.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('item pendente: o seletor −/+ salva a quantidade a cada toque', async () => {
    const fetchSpy = setup({
      items: [{ id: '21', name: 'Picanha', quantity: 2, unitPrice: 89.9, notes: null, status: 'pending' }],
    })
    const group = await screen.findByRole('group', { name: 'Quantidade de Picanha' })
    fireEvent.click(within(group).getByRole('button', { name: /Aumentar/ }))
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/order-items\/21\/quantity$/),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ quantity: 3 }) }),
      ),
    )
    await waitFor(() => expect(group).toHaveTextContent('3'))
  })
})
