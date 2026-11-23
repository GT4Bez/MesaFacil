import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Account from '../../src/pages/Account'
import Cashier from '../../src/pages/Cashier'
import Login from '../../src/pages/Login'
import { TOKEN_KEY } from '../../src/services/api'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const LOCKED = 'Muitas tentativas. Tente novamente em 15 minutos.'
const tooMany = () => jsonResponse({ success: false, error: LOCKED, code: 'TOO_MANY_ATTEMPTS' }, 429)

describe('Limite de tentativas de senha (RN-19)', () => {
  it('login: o 429 aparece no formulário, a senha é limpa e nenhuma sessão é criada', async () => {
    mockFetch({ 'POST /auth/login': tooMany })
    renderWithAuth(<Login />, { route: '/login', path: '/login' })

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'garcom@mesafacil.com' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: /Entrar na plataforma/i }))

    expect(await screen.findByText(LOCKED)).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toHaveValue('')
    expect(screen.getByLabelText('E-mail')).toHaveValue('garcom@mesafacil.com')
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('Minha conta: o 429 aparece, as senhas são limpas e a sessão continua', async () => {
    const user = { id: '1', name: 'Garçom', email: 'g@mesafacil.com', role: 'waiter', createdAt: new Date().toISOString() }
    mockFetch({ 'GET /me': user, 'PATCH /me/password': tooMany }, user)
    renderWithAuth(<Account />, { user, route: '/account', path: '/account' })
    await screen.findByText('g@mesafacil.com')

    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'tentativa' } })
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'nova1234' } })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'nova1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }))

    expect(await screen.findByText(LOCKED)).toBeInTheDocument()
    for (const label of ['Senha atual', 'Nova senha', 'Confirmar nova senha']) {
      expect(screen.getByLabelText(label)).toHaveValue('')
    }
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-test')
  })

  it('Caixa: o 429 da autorização aparece no modal, limpa a senha do gerente e não encerra a sessão', async () => {
    const cashier = { id: '3', name: 'Caixa', email: 'cx@m.com', role: 'cashier' }
    const bill = {
      orderId: '7', status: 'in_kitchen', serviceTax: false, payments: [],
      subtotal: 89.9, serviceTaxAmount: 0, total: 89.9, remainingBalance: 89.9,
      table: { number: 1 },
      items: [{ id: '21', name: 'Picanha', quantity: 1, unitPrice: 89.9 }],
    }
    mockFetch(
      {
        'GET /tables': [{ id: '1', number: 1, status: 'occupied', activeOrderId: '7' }],
        'GET /shifts/active': () => jsonResponse({ success: true, data: null }),
        'GET /orders/7/bill': () => jsonResponse({ success: true, data: bill }),
        'POST /order-items/21/authorized-cancel': tooMany,
      },
      cashier,
    )
    renderWithAuth(<Cashier />, { user: cashier, route: '/cashier', path: '/cashier' })
    fireEvent.click(await screen.findByRole('button', { name: /Mesa 1/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar Picanha' }))

    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Erro' } })
    fireEvent.change(within(dialog).getByLabelText('E-mail do gerente'), { target: { value: 'gerente@mesafacil.com' } })
    fireEvent.change(within(dialog).getByLabelText('Senha do gerente'), { target: { value: 'tentativa' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar item' }))

    expect(await within(dialog).findByText(LOCKED)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Senha do gerente')).toHaveValue('')
    await waitFor(() => expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-test'))
  })
})
