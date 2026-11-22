import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Cashier from '../../src/pages/Cashier'
import ShiftAdmin from '../../src/pages/ShiftAdmin'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const now = new Date().toISOString()
const movement = (id, type, amount, reason, by) => ({ id, type, amount, reason, by, createdAt: now })

function fillMovement(container, { type, amount, reason }) {
  const form = within(container)
  fireEvent.change(form.getByLabelText('Movimento'), { target: { value: type } })
  fireEvent.change(form.getByLabelText('Valor (R$)'), { target: { value: amount } })
  fireEvent.change(form.getByLabelText('Motivo'), { target: { value: reason } })
  fireEvent.click(form.getByRole('button', { name: 'Registrar movimento' }))
}

describe('Movimentos de caixa nas telas (RN-13)', () => {
  it('Caixa registra sangria, recarrega a lista e nunca vê o dinheiro esperado', async () => {
    const cashier = { id: '3', name: 'Caixa', email: 'cx@m.com', role: 'cashier' }
    let movements = [movement('1', 'opening_float', 100, null, 'Gerente')]
    const fetchSpy = mockFetch(
      {
        'GET /tables': [],
        'GET /shifts/active': () => jsonResponse({ success: true, data: { id: '5', status: 'open' } }),
        'GET /shifts/5/cash-movements': () => jsonResponse({ success: true, data: movements }),
        'POST /shifts/5/cash-movements': ({ body }) => {
          if (body.amount > 100) {
            return jsonResponse({ success: false, error: 'A sangria é maior que o dinheiro disponível na gaveta.' }, 422)
          }
          movements = [...movements, movement('2', body.type, body.amount, body.reason, 'Caixa')]
          return jsonResponse({ success: true, data: movements.at(-1) }, 201)
        },
      },
      cashier,
    )

    renderWithAuth(<Cashier />, { user: cashier, route: '/cashier', path: '/cashier' })
    const drawer = (await screen.findByText('Gaveta: sangria e reforço')).closest('section')
    expect(await within(drawer).findByText('Fundo de troco')).toBeInTheDocument()

    // Acima da gaveta: o erro da API aparece e nada é revelado sobre o valor esperado.
    fillMovement(drawer, { type: 'withdrawal', amount: '150', reason: 'Cofre' })
    expect(await within(drawer).findByText('A sangria é maior que o dinheiro disponível na gaveta.')).toBeInTheDocument()

    fillMovement(drawer, { type: 'withdrawal', amount: '40', reason: 'Cofre' })
    expect(await within(drawer).findByText('Sangria registrada com sucesso!')).toBeInTheDocument()
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/shifts\/5\/cash-movements$/),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ type: 'withdrawal', amount: 40, reason: 'Cofre' }),
        }),
      ),
    )
    expect(await within(drawer).findByText('Sangria')).toBeInTheDocument()
    expect(within(drawer).getByLabelText('Valor (R$)')).toHaveValue(null)
    expect(screen.queryByText(/esperado/i)).not.toBeInTheDocument()
  })

  it('Caixa sem turno aberto não vê o formulário', async () => {
    const cashier = { id: '3', name: 'Caixa', email: 'cx@m.com', role: 'cashier' }
    mockFetch(
      { 'GET /tables': [], 'GET /shifts/active': () => jsonResponse({ success: true, data: null }) },
      cashier,
    )
    renderWithAuth(<Cashier />, { user: cashier, route: '/cashier', path: '/cashier' })
    expect(await screen.findByText('Nenhum turno aberto.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar movimento' })).not.toBeInTheDocument()
  })

  it('Gerente vê o dinheiro esperado no relatório e registra reforço no turno aberto', async () => {
    const manager = { id: '4', name: 'Gerente', email: 'ger@m.com', role: 'manager' }
    let cash = {
      openingFloat: 100,
      cashPayments: 48.89,
      withdrawals: 0,
      reinforcements: 0,
      expected: 148.89,
      movements: [movement('1', 'opening_float', 100, null, 'Gerente')],
    }
    const report = () => ({
      shift: { id: '5', status: 'open', openedAt: now, closedAt: null, openedBy: 'Gerente' },
      totalShift: 98.89,
      ordersClosed: 1,
      averageTicket: 98.89,
      byPaymentMethod: [
        { method: 'cash', total: 48.89, count: 1 },
        { method: 'card', total: 0, count: 0 },
        { method: 'pix', total: 50, count: 1 },
      ],
      byMenuItem: [],
      cancellations: { ordersCount: 0, orders: [], items: [] },
      cash,
    })
    mockFetch(
      {
        'GET /shifts/active': () => jsonResponse({ success: true, data: { id: '5', status: 'open', openedAt: now } }),
        'GET /shifts/5/report': () => jsonResponse({ success: true, data: report() }),
        'POST /shifts/5/cash-movements': ({ body }) => {
          cash = {
            ...cash,
            reinforcements: body.amount,
            expected: 168.89,
            movements: [...cash.movements, movement('2', body.type, body.amount, body.reason, 'Gerente')],
          }
          return jsonResponse({ success: true, data: { id: '2', expectedCash: 168.89 } }, 201)
        },
      },
      manager,
    )

    renderWithAuth(<ShiftAdmin />, { user: manager, route: '/admin/shift', path: '/admin/shift' })
    const summary = (await screen.findByText('Dinheiro na gaveta')).closest('section')
    expect(within(summary).getByText('Dinheiro esperado').nextSibling).toHaveTextContent(/R\$\s*148,89/)

    const panel = screen.getByText('Movimentos de caixa').closest('section')
    fillMovement(panel, { type: 'reinforcement', amount: '20', reason: 'Moedas' })
    expect(await within(panel).findByText('Reforço registrado com sucesso!')).toBeInTheDocument()
    await waitFor(() =>
      expect(within(summary).getByText('Dinheiro esperado').nextSibling).toHaveTextContent(/R\$\s*168,89/),
    )
    expect(within(panel).getByText('Moedas')).toBeInTheDocument()
  })
})
