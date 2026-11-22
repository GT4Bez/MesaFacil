import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import Layout from '../../src/components/Layout'
import { AuthProvider, useAuth } from '../../src/context/AuthContext'
import { TOKEN_KEY } from '../../src/services/api'
import { mockFetch, seedSession } from '../support/helpers'

// Como a rota protegida do app: sem usuário, não renderiza o Layout.
function Guard() {
  const { user } = useAuth()
  return user ? <Layout /> : <p>Tela de login</p>
}

describe('Layout (spec 012)', () => {
  it('links do menu têm nome acessível, marcam a tela atual e há "Sair" na barra superior', () => {
    const manager = seedSession({ id: '4', name: 'Gerente', email: 'ger@m.com', role: 'manager' })
    mockFetch({}, manager)
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/kitchen']}>
          <Routes>
            <Route element={<Guard />}>
              <Route path="/kitchen" element={<p>KDS</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    )

    const nav = screen.getByRole('navigation', { name: 'Menu principal' })
    expect(screen.getByRole('link', { name: 'Cozinha (KDS)' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Admin do cardápio' })).toBeInTheDocument()
    expect(nav).toHaveTextContent('Cardápio')

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(screen.getByText('Tela de login')).toBeInTheDocument()
  })
})
