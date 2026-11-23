import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import Layout, { MOBILE_SLOTS, overflowOf } from '../../src/components/Layout'
import { menuFor } from '../../src/utils/access'
import { AuthProvider, useAuth } from '../../src/context/AuthContext'
import { TOKEN_KEY } from '../../src/services/api'
import { mockFetch, seedSession } from '../support/helpers'

function CurrentPath() {
  return <p>Tela {useLocation().pathname}</p>
}

function renderAt(user, path) {
  const session = seedSession(user)
  mockFetch({}, session)
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Guard />}>
            <Route path="*" element={<CurrentPath />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

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

  it('barra do celular: até 5 posições por papel; o excedente vai para "Mais"', () => {
    for (const role of ['admin', 'manager', 'cashier', 'waiter', 'kitchen']) {
      const screens = menuFor(role)
      const visible = screens.length - overflowOf(screens).length + (overflowOf(screens).length ? 1 : 0)
      expect(visible, role).toBeLessThanOrEqual(MOBILE_SLOTS)
    }
    expect(overflowOf(menuFor('cashier'))).toEqual([])
    expect(overflowOf(menuFor('admin')).map((s) => s.short)).toEqual(['Cardápio', 'Insumos', 'Turno', 'Auditoria', 'Conta'])
  })

  it('"Mais" abre a lista das telas excedentes, marca a atual e fecha ao navegar', () => {
    renderAt({ id: '1', name: 'Admin', email: 'adm@m.com', role: 'admin' }, '/admin/shift')

    // No desktop todos os links continuam no menu; no celular os excedentes ficam ocultos (CSS).
    expect(screen.getByRole('link', { name: 'Turno e relatório' })).toHaveClass('nav-overflow')
    expect(screen.getByRole('link', { name: 'Usuários' })).not.toHaveClass('nav-overflow')
    const more = screen.getByRole('button', { name: 'Mais telas' })
    expect(more).toHaveClass('active')

    fireEvent.click(more)
    const dialog = screen.getByRole('dialog', { name: 'Mais telas' })
    expect(within(dialog).getAllByRole('link').map((a) => a.textContent)).toEqual([
      '☰Admin do cardápio',
      '⚖Insumos',
      '◷Turno e relatório',
      '☷Auditoria',
      '⚙Minha conta',
    ])
    expect(within(dialog).getByRole('link', { name: /Turno e relatório/ })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(within(dialog).getByRole('link', { name: /Insumos/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Tela /admin/ingredients')).toBeInTheDocument()
  })

  it('papel com até 5 telas não tem "Mais"', () => {
    renderAt({ id: '3', name: 'Caixa', email: 'cx@m.com', role: 'cashier' }, '/cashier')
    expect(screen.queryByRole('button', { name: 'Mais telas' })).not.toBeInTheDocument()
  })
})
