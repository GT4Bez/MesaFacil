import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { AuthProvider } from '../../src/context/AuthContext'
import { TOKEN_KEY } from '../../src/services/api'

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function seedSession(user = { id: '1', name: 'Teste', email: 't@mesafacil.com', role: 'manager' }) {
  localStorage.setItem(TOKEN_KEY, 'jwt-test')
  localStorage.setItem('mesa-facil-user', JSON.stringify(user))
  return user
}

/**
 * Roteador simples para mockar `globalThis.fetch` por `"METHOD /path"` (ou handler função),
 * já respondendo `/me` automaticamente quando houver usuário autenticado.
 */
export function mockFetch(routes, user) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase()
    const path = new URL(String(url), 'http://localhost').pathname
    const key = `${method} ${path}`
    const match = routes[key] ?? routes[path]

    if (typeof match === 'function') return match({ url, path, method, body: init.body && JSON.parse(init.body) })
    if (match) return jsonResponse(match.body ?? { success: true, data: match }, match.status ?? 200)
    if (key === 'GET /me' && user) return jsonResponse({ success: true, data: user })

    throw new Error(`Fetch não mockado para: ${key}`)
  })
}

export function renderWithAuth(ui, { user = null, route = '/', path = '/' } = {}) {
  if (user) seedSession(user)
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}
