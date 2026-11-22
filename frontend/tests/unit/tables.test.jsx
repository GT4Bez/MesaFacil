import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Tables from '../../src/pages/Tables'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const manager = { id: '4', name: 'Gerente', email: 'ger@m.com', role: 'manager' }
const tables = [{ id: '1', number: 1, status: 'available', activeOrderId: null }]

describe('Salão: banner do turno (RN-02, RN-13)', () => {
  it('sem turno, o gerente é levado à tela de turno para informar o fundo de troco', async () => {
    const fetchSpy = mockFetch(
      { 'GET /tables': tables, 'GET /shifts/active': () => jsonResponse({ success: true, data: null }) },
      manager,
    )
    renderWithAuth(<Tables />, { user: manager, route: '/tables', path: '/tables' })

    const link = await screen.findByRole('link', { name: /Abrir turno/ })
    expect(link).toHaveAttribute('href', '/admin/shift')
    expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringMatching(/\/shifts$/), expect.objectContaining({ method: 'POST' }))
  })

  it('com turno aberto, o gerente é levado à conferência (RN-14)', async () => {
    mockFetch(
      {
        'GET /tables': tables,
        'GET /shifts/active': () => jsonResponse({ success: true, data: { id: '5', status: 'open' } }),
      },
      manager,
    )
    renderWithAuth(<Tables />, { user: manager, route: '/tables', path: '/tables' })
    const link = await screen.findByRole('link', { name: /Conferir e encerrar/ })
    expect(link).toHaveAttribute('href', '/admin/shift')
  })
})
