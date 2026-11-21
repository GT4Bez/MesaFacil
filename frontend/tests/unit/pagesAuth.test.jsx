import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Account from '../../src/pages/Account'
import Login from '../../src/pages/Login'
import Users from '../../src/pages/Users'
import { TOKEN_KEY } from '../../src/services/api'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

describe('Telas de Autenticação, Conta e Usuários (RN-16)', () => {
  it('Login autentica e grava sessão no localStorage', async () => {
    mockFetch({
      'POST /auth/login': {
        token: 'jwt-ok',
        user: { id: '1', name: 'Admin', email: 'admin@mesafacil.com', role: 'admin' },
      },
    })

    renderWithAuth(<Login />, { route: '/login', path: '/login' })
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'admin@mesafacil.com' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: /Entrar na plataforma/i }))

    await waitFor(() => expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-ok'))
  })

  it('Account limpa erro da API quando confirmação diverge e faz logout após troca', async () => {
    const user = { id: '1', name: 'Garçom', email: 'g@mesafacil.com', role: 'waiter', createdAt: new Date().toISOString() }
    mockFetch(
      {
        'GET /me': user,
        'PATCH /me/password': ({ body }) =>
          body.currentPassword === 'errada'
            ? jsonResponse({ success: false, error: 'Senha atual incorreta.' }, 422)
            : jsonResponse({ success: true, data: { id: '1' } }),
      },
      user,
    )

    renderWithAuth(<Account />, { user, route: '/account', path: '/account' })
    expect(await screen.findByText('g@mesafacil.com')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'errada' } })
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'nova1234' } })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'nova1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }))
    expect(await screen.findByText('Senha atual incorreta.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'diferente' } })
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }))
    expect(screen.queryByText('Senha atual incorreta.')).not.toBeInTheDocument()
    expect(screen.getByText('A confirmação não confere com a nova senha.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'nova1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }))
    await waitFor(() => expect(localStorage.getItem(TOKEN_KEY)).toBeNull())
  })

  it('Users bloqueia edição do próprio papel e oculta botão Desativar para si mesmo', async () => {
    const admin = { id: '1', name: 'Admin', email: 'admin@mesafacil.com', role: 'admin', active: true }
    const waiter = { id: '2', name: 'Carlos', email: 'garcom@mesafacil.com', role: 'waiter', active: true }
    mockFetch({ 'GET /users': [admin, waiter] }, admin)

    renderWithAuth(<Users />, { user: admin, route: '/admin/users', path: '/admin/users' })
    expect(await screen.findByText(/Admin \(você\)/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Desativar' })).toHaveLength(1)

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0])
    const formRoleSelect = screen.getByRole('button', { name: 'Salvar alterações' }).closest('form').querySelector('select')
    expect(formRoleSelect).toBeDisabled()
  })
})
