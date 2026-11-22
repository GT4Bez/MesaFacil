import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthProvider, useAuth } from '../../src/context/AuthContext'
import { TOKEN_KEY } from '../../src/services/api'
import { jsonResponse, mockFetch, seedSession } from '../support/helpers'

function SessionProbe() {
  const { user, logout } = useAuth()
  return user ? (
    <button onClick={() => logout()}>Sair ({user.name})</button>
  ) : (
    <p>Sessão encerrada</p>
  )
}

describe('AuthContext (issue #94)', () => {
  it('resposta atrasada de /me não desfaz o logout', async () => {
    seedSession({ id: '1', name: 'Caixa', email: 'caixa@mesafacil.com', role: 'cashier' })
    let respondMe
    const fetchSpy = mockFetch({
      'GET /me': () =>
        new Promise((resolve) => {
          respondMe = () =>
            resolve(jsonResponse({ success: true, data: { id: '1', name: 'Caixa', email: 'caixa@mesafacil.com', role: 'cashier' } }))
        }),
    })

    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    )
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())

    // Sai enquanto /me ainda está a caminho; depois a resposta chega.
    fireEvent.click(screen.getByRole('button', { name: /Sair/ }))
    await act(async () => respondMe())

    expect(screen.getByText('Sessão encerrada')).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem('mesa-facil-user')).toBeNull()
  })

  it('com a sessão intacta, /me atualiza nome e papel salvos no navegador', async () => {
    seedSession({ id: '1', name: 'Nome antigo', email: 'g@mesafacil.com', role: 'waiter' })
    mockFetch({ 'GET /me': { id: '1', name: 'Nome novo', email: 'g@mesafacil.com', role: 'manager' } })

    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    )

    expect(await screen.findByRole('button', { name: 'Sair (Nome novo)' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('mesa-facil-user')).role).toBe('manager')
  })
})
