import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Cashier from '../../src/pages/Cashier'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'
import { TOKEN_KEY } from '../../src/services/api'

const cashier = { id: '3', name: 'Caixa', email: 'cx@m.com', role: 'cashier' }
const manager = { id: '4', name: 'Gerente', email: 'g@m.com', role: 'manager' }

const billWith = (items) => ({
  orderId: '7', status: 'in_kitchen', serviceTax: false, payments: [],
  subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  serviceTaxAmount: 0,
  total: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  remainingBalance: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  table: { number: 1 },
  items,
})
const picanha = { id: '21', name: 'Picanha', quantity: 2, unitPrice: 89.9 }
const suco = { id: '22', name: 'Suco', quantity: 1, unitPrice: 10 }

// Monta o Caixa com a mesa 1 selecionada; `routes` acrescenta/ sobrescreve rotas mockadas.
async function renderCashier(user, routes = {}) {
  const calls = []
  let items = [picanha, suco]
  mockFetch(
    {
      'GET /tables': [{ id: '1', number: 1, status: 'occupied', activeOrderId: '7' }],
      'GET /shifts/active': () => jsonResponse({ success: true, data: null }),
      'GET /orders/7/bill': () => jsonResponse({ success: true, data: billWith(items) }),
      ...Object.fromEntries(
        Object.entries(routes).map(([key, handler]) => [
          key,
          (req) => {
            calls.push({ key, body: req.body })
            const res = handler(req)
            if (res.status === 200) items = items.filter((item) => !req.path.includes(`/${item.id}/`))
            return res
          },
        ]),
      ),
    },
    user,
  )
  renderWithAuth(<Cashier />, { user, route: '/cashier', path: '/cashier' })
  fireEvent.click(await screen.findByRole('button', { name: /Mesa 1/ }))
  await screen.findByText('Picanha')
  return calls
}

describe('Cancelar item no Caixa (RN-17)', () => {
  it('caixa: modal pede motivo e autorização do gerente e envia para authorized-cancel', async () => {
    const calls = await renderCashier(cashier, {
      'POST /order-items/21/authorized-cancel': () =>
        jsonResponse({ success: true, data: { id: '21', status: 'canceled', approvedBy: { id: '4', name: 'Gerente' } } }),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar Picanha' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancelar item com autorização' })
    expect(within(dialog).getByText(/2× Picanha · R\$\s*179,80/)).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: ' Não chegou ' } })
    fireEvent.change(within(dialog).getByLabelText('E-mail do gerente'), { target: { value: ' gerente@mesafacil.com ' } })
    fireEvent.change(within(dialog).getByLabelText('Senha do gerente'), { target: { value: '123' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar item' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Item cancelado: Picanha (autorizado por Gerente)')
    expect(calls).toEqual([
      {
        key: 'POST /order-items/21/authorized-cancel',
        body: { reason: 'Não chegou', approver: { email: 'gerente@mesafacil.com', password: '123' } },
      },
    ])
    expect(screen.queryByText('Picanha')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('caixa: autorização inválida (403) aparece no modal, limpa a senha e não encerra a sessão', async () => {
    await renderCashier(cashier, {
      'POST /order-items/21/authorized-cancel': () =>
        jsonResponse({ success: false, error: 'Autorização do gerente inválida.', code: 'FORBIDDEN' }, 403),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar Picanha' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Erro' } })
    fireEvent.change(within(dialog).getByLabelText('E-mail do gerente'), { target: { value: 'gerente@mesafacil.com' } })
    fireEvent.change(within(dialog).getByLabelText('Senha do gerente'), { target: { value: 'errada' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar item' }))

    expect(await within(dialog).findByText('Autorização do gerente inválida.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Senha do gerente')).toHaveValue('')
    expect(screen.getByText('Picanha')).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-test')
  })

  it('gerente: o "×" abre só o motivo e cancela pela RN-05', async () => {
    const calls = await renderCashier(manager, {
      'PATCH /order-items/22/status': () => jsonResponse({ success: true, data: { id: '22', status: 'canceled' } }),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar Suco' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancelar Suco' })
    expect(within(dialog).queryByLabelText('Senha do gerente')).not.toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Lançado em dobro' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar item' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Item cancelado: Suco')
    expect(calls).toEqual([
      { key: 'PATCH /order-items/22/status', body: { status: 'canceled', reason: 'Lançado em dobro' } },
    ])
  })
})
