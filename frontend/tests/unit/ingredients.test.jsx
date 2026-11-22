import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Ingredients from '../../src/pages/Ingredients'
import MenuAdmin from '../../src/pages/MenuAdmin'
import ShiftAdmin from '../../src/pages/ShiftAdmin'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const manager = { id: '4', name: 'Gerente', email: 'g@m.com', role: 'manager' }
const ok = (data) => () => jsonResponse({ success: true, data })

const ingredient = (id, name, extra = {}) => ({
  id, name, unit: 'kg', stockQuantity: 10, minStock: 2, unitCost: 10, active: true, belowMin: false, ...extra,
})

describe('Insumos, ficha técnica e CMV (RN-15)', () => {
  it('lista o estoque com alerta de mínimo e registra entrada e ajuste', async () => {
    const sent = []
    let items = [
      ingredient('1', 'Picanha', { stockQuantity: 11.6, unitCost: 69.9 }),
      ingredient('2', 'Leite condensado', { unit: 'un', stockQuantity: 2, minStock: 6, unitCost: 7.9, belowMin: true }),
    ]
    mockFetch(
      {
        'GET /ingredients': () => jsonResponse({ success: true, data: items }),
        'POST /ingredients/1/purchases': ({ body }) => {
          sent.push(['purchase', body])
          items = items.map((item) => (item.id === '1' ? { ...item, stockQuantity: 16.6, unitCost: body.unitCost } : item))
          return jsonResponse({ success: true, data: items[0] }, 201)
        },
        'POST /ingredients/2/adjustments': ({ body }) => {
          sent.push(['adjustment', body])
          return jsonResponse({ success: true, data: items[1] }, 201)
        },
      },
      manager,
    )
    renderWithAuth(<Ingredients />, { user: manager, route: '/admin/ingredients', path: '/admin/ingredients' })

    expect(await screen.findByText(/1 insumo\(s\) abaixo do estoque mínimo: Leite condensado/)).toBeInTheDocument()
    const leite = screen.getByRole('article', { name: 'Leite condensado' })
    expect(within(leite).getByText('Abaixo do mínimo')).toBeInTheDocument()
    expect(leite).toHaveClass('below-min')
    const picanha = screen.getByRole('article', { name: 'Picanha' })
    expect(within(picanha).getByText('11,6 kg')).toBeInTheDocument()

    fireEvent.click(within(picanha).getByRole('button', { name: 'Entrada' }))
    let dialog = screen.getByRole('dialog', { name: 'Entrada: Picanha' })
    fireEvent.change(within(dialog).getByLabelText('Quantidade comprada (kg)'), { target: { value: '5' } })
    fireEvent.change(within(dialog).getByLabelText('Custo por kg (R$)'), { target: { value: '72.5' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar entrada' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Entrada registrada: Picanha agora com 16,6 kg')

    fireEvent.click(within(screen.getByRole('article', { name: 'Leite condensado' })).getByRole('button', { name: 'Ajuste' }))
    dialog = screen.getByRole('dialog', { name: 'Ajuste: Leite condensado' })
    fireEvent.change(within(dialog).getByLabelText('Quantidade contada (un)'), { target: { value: '1' } })
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Lata amassada' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar ajuste' }))
    expect(await screen.findByText('Estoque de Leite condensado ajustado')).toBeInTheDocument()

    expect(sent).toEqual([
      ['purchase', { quantity: 5, unitCost: 72.5 }],
      ['adjustment', { countedQuantity: 1, reason: 'Lata amassada' }],
    ])
  })

  it('ficha técnica: edita as linhas, estima custo e margem e envia a ficha inteira', async () => {
    const sent = []
    const item = { id: '1', name: 'Picanha na Chapa', category: 'Pratos', price: 89.9, available: true }
    mockFetch(
      {
        'GET /menu-items': [item],
        'GET /menu-items/categories': ['Pratos'],
        'GET /ingredients': [
          ingredient('1', 'Picanha', { unitCost: 70 }),
          ingredient('2', 'Arroz', { unitCost: 5.8 }),
          ingredient('3', 'Tempero antigo', { active: false }),
        ],
        'GET /menu-items/1/recipe': {
          menuItemId: '1', price: 89.9, cost: 28, margin: 61.9, marginPercent: 68.9,
          items: [{ ingredientId: '1', name: 'Picanha', unit: 'kg', quantity: 0.4, unitCost: 70, cost: 28, active: true }],
        },
        'PUT /menu-items/1/recipe': ({ body }) => {
          sent.push(body)
          return jsonResponse({ success: true, data: { menuItemId: '1', price: 89.9, cost: 28.87, margin: 61.03, marginPercent: 67.9, items: [] } })
        },
      },
      manager,
    )
    renderWithAuth(<MenuAdmin />, { user: manager, route: '/admin/menu', path: '/admin/menu' })

    fireEvent.click(await screen.findByRole('button', { name: 'Ficha técnica' }))
    const dialog = screen.getByRole('dialog', { name: 'Ficha técnica: Picanha na Chapa' })
    expect(await within(dialog).findByDisplayValue('0.4')).toBeInTheDocument()
    expect(within(dialog).getByText('Custo estimado').nextSibling).toHaveTextContent(/28,00/)

    fireEvent.click(within(dialog).getByRole('button', { name: '+ Adicionar insumo' }))
    const selects = within(dialog).getAllByLabelText('Insumo')
    // Insumo inativo não é oferecido em linha nova.
    expect(within(selects[1]).queryByText('Tempero antigo')).not.toBeInTheDocument()
    expect(selects[1]).toHaveValue('2')
    fireEvent.change(within(dialog).getAllByRole('spinbutton')[1], { target: { value: '0.15' } })
    expect(within(dialog).getByText('Custo estimado').nextSibling).toHaveTextContent(/28,87/)
    expect(within(dialog).getByText(/61,03.*67,9 %/)).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar ficha' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/Ficha de Picanha na Chapa salva · custo R\$\s*28,87/)
    expect(sent).toEqual([{ items: [{ ingredientId: '1', quantity: 0.4 }, { ingredientId: '2', quantity: 0.15 }] }])
  })

  it('relatório do turno mostra o CMV, a margem, as perdas e a cobertura das fichas', async () => {
    const shift = { id: '5', status: 'closed', openedAt: new Date().toISOString(), closedAt: new Date().toISOString(), openedBy: 'Gerente' }
    mockFetch(
      {
        'GET /shifts/active': ok(null),
        'GET /shifts/5/report': ok({
          shift,
          totalShift: 98.89,
          ordersClosed: 1,
          averageTicket: 98.89,
          byPaymentMethod: [],
          byMenuItem: [],
          cancellations: { ordersCount: 0, orders: [], items: [] },
          cash: { openingFloat: 0, cashPayments: 0, withdrawals: 0, reinforcements: 0, expected: 0, movements: [] },
          cmv: { revenue: 89.9, cost: 30.07, grossMargin: 59.83, marginPercent: 66.6, losses: 4.67, soldItems: 1, itemsWithRecipe: 1 },
        }),
      },
      manager,
    )
    renderWithAuth(<ShiftAdmin />, { user: manager, route: '/admin/shift', path: '/admin/shift' })
    fireEvent.change(await screen.findByLabelText('Ver relatório do turno nº'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver relatório' }))

    const panel = await screen.findByRole('region', { name: 'CMV (custo dos produtos vendidos)' })
    expect(panel).toHaveTextContent('1 de 1 item(ns) vendido(s) com ficha técnica')
    expect(panel).toHaveTextContent(/− CMV\s*R\$\s*30,07/)
    expect(panel).toHaveTextContent(/Margem bruta\s*R\$\s*59,83 \(66,6 %\)/)
    expect(panel).toHaveTextContent(/Perdas \(itens enviados e cancelados\)\s*R\$\s*4,67/)
  })
})
