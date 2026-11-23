import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Ingredients from '../../src/pages/Ingredients'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const manager = { id: '4', name: 'Gerente', email: 'ger@m.com', role: 'manager' }
const picanha = { id: '3', name: 'Picanha', unit: 'kg', stockQuantity: 3.9, minStock: 2, unitCost: 79.9, active: true, belowMin: false }
const now = new Date().toISOString()
const sale = (id, quantity, balanceAfter, orderId, tableNumber, itemQuantity) => ({
  id, type: 'sale', quantity, unitCost: 79.9, balanceAfter, createdAt: now, by: 'Garçom', reason: null, shiftId: '7',
  sale: { orderId, tableNumber, menuItem: 'Picanha na chapa', itemQuantity },
})
const SALES = [sale('9', -0.6, 3.9, '42', 5, 2), sale('8', -0.3, 4.5, '41', 4, 1)]
const ADJUSTMENT = { id: '7', type: 'adjustment', quantity: -0.2, unitCost: 79.9, balanceAfter: 4.8, createdAt: now, by: 'Gerente', reason: 'Aparas', shiftId: null, sale: null }
const PURCHASE = { id: '6', type: 'purchase', quantity: 5, unitCost: 79.9, balanceAfter: 5, createdAt: now, by: 'Gerente', reason: null, shiftId: null, sale: null }

async function openHistory(handler) {
  const requests = []
  mockFetch(
    {
      'GET /ingredients': [picanha],
      'GET /ingredients/3/movements': ({ url }) => {
        const params = new URL(String(url), 'http://localhost').searchParams
        requests.push(Object.fromEntries(params))
        return jsonResponse({ success: true, data: handler(params) })
      },
    },
    manager,
  )
  renderWithAuth(<Ingredients />, { user: manager, route: '/admin/ingredients', path: '/admin/ingredients' })
  const card = await screen.findByRole('article', { name: 'Picanha' })
  fireEvent.click(within(card).getByRole('button', { name: 'Histórico' }))
  const dialog = await screen.findByRole('dialog', { name: 'Histórico · Picanha' })
  return { dialog, requests }
}

const rows = (dialog) => within(dialog).getAllByRole('row').slice(1).map((row) => row.textContent)

describe('Histórico do insumo (spec 016)', () => {
  it('abre com saldo, movimentos e origem da venda; "Carregar mais" acrescenta a próxima página', async () => {
    const { dialog, requests } = await openHistory((params) =>
      params.get('before') === '8'
        ? { ingredient: picanha, consistent: true, movements: [ADJUSTMENT, PURCHASE], nextBefore: null }
        : { ingredient: picanha, consistent: true, movements: SALES, nextBefore: '8' },
    )

    expect(within(dialog).getByText('Saldo atual').nextSibling).toHaveTextContent('3,9 kg')
    await waitFor(() => expect(rows(dialog)).toHaveLength(2))
    expect(rows(dialog)[0]).toContain('Venda')
    expect(rows(dialog)[0]).toContain('−0,6 kg')
    expect(rows(dialog)[0]).toContain('Pedido 42 · Mesa 5 · 2× Picanha na chapa')
    expect(within(dialog).getByText('−0,6 kg')).toHaveClass('qty-out')
    expect(within(dialog).queryByText(/não bate/)).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Carregar mais' }))
    await waitFor(() => expect(rows(dialog)).toHaveLength(4))
    expect(rows(dialog)[2]).toContain('Aparas')
    expect(within(dialog).getByText('+5 kg')).toHaveClass('qty-in')
    expect(within(dialog).queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument()
    expect(requests).toEqual([{}, { before: '8' }])
  })

  it('filtro troca a lista e marca o botão; divergência mostra o aviso', async () => {
    const { dialog, requests } = await openHistory((params) => ({
      ingredient: picanha,
      consistent: false,
      movements: params.get('type') === 'adjustment' ? [ADJUSTMENT] : [...SALES, ADJUSTMENT, PURCHASE],
      nextBefore: null,
    }))
    await waitFor(() => expect(rows(dialog)).toHaveLength(4))
    expect(within(dialog).getByText('O saldo atual não bate com a soma dos movimentos.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajustes' }))
    await waitFor(() => expect(rows(dialog)).toHaveLength(1))
    expect(within(dialog).getByRole('button', { name: 'Ajustes' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'false')
    expect(requests).toEqual([{}, { type: 'adjustment' }])
  })

  it('insumo sem movimentos mostra o estado vazio', async () => {
    const { dialog } = await openHistory(() => ({ ingredient: picanha, consistent: true, movements: [], nextBefore: null }))
    expect(await within(dialog).findByText('Nenhum movimento registrado.')).toBeInTheDocument()
  })
})
