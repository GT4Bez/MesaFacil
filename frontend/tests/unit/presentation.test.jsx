import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'
import { dedent } from '../../src/pages/presentation/Presentation'
import { ENTRIES } from '../../src/pages/presentation/sections'
import { mockFetch, renderWithAuth } from '../support/helpers'

describe('Página /apresentacao (spec 023)', () => {
  it('abre sem login, com índice, resumo e todas as entradas com arquivo:linha', async () => {
    mockFetch({})
    renderWithAuth(<App />, { route: '/apresentacao', path: '*' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Como o MesaFácil é construído' })).toBeInTheDocument()
    const index = screen.getByRole('navigation', { name: 'Índice' })
    expect(within(index).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Programação Orientada a Objetos',
      'SOLID',
      'KISS, YAGNI e DRY',
      'Padrões de projeto',
    ])
    expect(screen.getAllByRole('article')).toHaveLength(ENTRIES.length)
    const singleton = screen.getByRole('article', { name: 'Singleton' })
    expect(within(singleton).getByRole('link', { name: 'backend/src/database/DatabaseConnection.js:6–17' })).toHaveAttribute(
      'href',
      'https://github.com/GT4Bez/MesaFacil/blob/main/backend/src/database/DatabaseConnection.js#L6-L17',
    )
    expect(within(singleton).getByText(/static getInstance\(\)/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar no sistema →' })).toHaveAttribute('href', '/login')
  })

  it('dedent tira só a indentação comum', () => {
    expect(dedent('    a\n      b\n\n    c')).toBe('a\n  b\n\nc')
  })
})
