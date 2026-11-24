import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'
import { dedent, parseHash, TOPICS } from '../../src/pages/presentation/Presentation'
import { ENTRIES } from '../../src/pages/presentation/sections'
import { MEMBERS } from '../../src/pages/presentation/team'
import { mockFetch, renderWithAuth } from '../support/helpers'

function abrir(route) {
  mockFetch({})
  renderWithAuth(<App />, { route, path: '*' })
}

const topicos = () => screen.getByRole('navigation', { name: 'Tópicos' })
const atual = () => within(topicos()).getByRole('link', { current: 'page' })

describe('Página /apresentacao (specs 023 e 024)', () => {
  it('abre sem login na Visão geral, com a barra de tópicos e o resumo', async () => {
    abrir('/apresentacao')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Como o MesaFácil é construído' }),
    ).toBeInTheDocument()
    expect(
      within(topicos())
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'Visão geral',
      'Equipe',
      'Como trabalhamos',
      'POO',
      'SOLID',
      'KISS, YAGNI e DRY',
      'Padrões',
    ])
    expect(atual()).toHaveTextContent('Visão geral')
    expect(screen.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeInTheDocument()
    const resumo = screen.getByRole('table')
    expect(within(resumo).getAllByRole('row')).toHaveLength(ENTRIES.length + 1)
    expect(
      within(resumo).getByRole('link', { name: 'D — Inversão de dependência' }),
    ).toHaveAttribute('href', '/apresentacao#solid/d')
    // Só o tópico atual aparece: nenhum trecho de código na Visão geral.
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(screen.getByRole('link', { name: 'Entrar no sistema →' })).toHaveAttribute(
      'href',
      '/login',
    )
  })

  it('#equipe mostra os cinco integrantes com papel, números e a nota de medição', async () => {
    abrir('/apresentacao#equipe')

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Equipe: papel e participação' }),
    ).toBeInTheDocument()
    expect(atual()).toHaveTextContent('Equipe')
    const cards = screen.getAllByRole('article')
    expect(
      cards.map((card) => within(card).getByRole('heading', { level: 3 }).textContent),
    ).toEqual(MEMBERS.map((member) => member.name))
    const paulo = screen.getByRole('article', { name: 'Paulo Henrique' })
    expect(within(paulo).getByText('Tech Lead, Product Owner e QA')).toBeInTheDocument()
    expect(within(paulo).getByRole('link', { name: '@PauloHenrrq' })).toHaveAttribute(
      'href',
      'https://github.com/PauloHenrrq',
    )
    expect(within(paulo).getByText('PRs revisados').nextSibling).toHaveTextContent('75')
    const kauan = screen.getByRole('article', { name: 'Kauan Santos' })
    expect(within(kauan).getByText(/Frontend base em React\/Vite/)).toBeInTheDocument()
    expect(within(kauan).getByText(/entrou pela conta do Rodolfo/)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Como a participação foi medida' }),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/@[\w.-]+\.(com|br)/)
  })

  it('#processo mostra o fluxo e as práticas da equipe', async () => {
    abrir('/apresentacao#processo')

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Como trabalhamos' }),
    ).toBeInTheDocument()
    const fluxo = screen.getByRole('list', { name: 'Fluxo de cada funcionalidade' })
    expect(within(fluxo).getAllByRole('listitem')[0]).toHaveTextContent('Spec')
    for (const pratica of ['Contract-First', 'Spec-Driven Development', 'Revisão, QA e CI']) {
      expect(screen.getByRole('region', { name: pratica })).toBeInTheDocument()
    }
  })

  it('tópico de arquitetura mostra só as entradas do grupo, com arquivo:linha', async () => {
    abrir('/apresentacao#padroes')

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Padrões de projeto' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(
      ENTRIES.filter((entry) => entry.group === 'padroes').length,
    )
    const singleton = screen.getByRole('article', { name: 'Singleton' })
    expect(
      within(singleton).getByRole('link', {
        name: 'backend/src/database/DatabaseConnection.js:6–17',
      }),
    ).toHaveAttribute(
      'href',
      'https://github.com/GT4Bez/MesaFacil/blob/main/backend/src/database/DatabaseConnection.js#L6-L17',
    )
    expect(within(singleton).getByText(/static getInstance\(\)/)).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Herança' })).not.toBeInTheDocument()
  })

  it('trocar de tópico pela barra, pelo resumo e por "próximo" mostra o tópico escolhido', async () => {
    abrir('/apresentacao')
    await screen.findByRole('heading', { level: 2, name: 'Visão geral' })

    fireEvent.click(within(topicos()).getByRole('link', { name: 'SOLID' }))
    expect(screen.getByRole('heading', { level: 2, name: 'SOLID' })).toBeInTheDocument()
    expect(atual()).toHaveTextContent('SOLID')
    expect(screen.getByRole('article', { name: 'S — Responsabilidade única' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'KISS, YAGNI e DRY →' }))
    expect(screen.getByRole('heading', { level: 2, name: 'KISS, YAGNI e DRY' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '← SOLID' }))
    fireEvent.click(within(topicos()).getByRole('link', { name: 'Visão geral' }))
    fireEvent.click(screen.getByRole('link', { name: 'Repository' }))
    expect(
      screen.getByRole('heading', { level: 2, name: 'Padrões de projeto' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Repository' })).toBeInTheDocument()
  })

  it('o primeiro tópico não tem "anterior" e o último não tem "próximo"', async () => {
    abrir('/apresentacao#padroes')
    const pager = await screen.findByRole('navigation', { name: 'Navegação entre tópicos' })
    expect(
      within(pager)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['← KISS, YAGNI e DRY'])
  })

  it('parseHash aceita tópico e entrada e cai na Visão geral com âncora desconhecida', () => {
    expect(parseHash('#solid/d')).toEqual({ topic: 'solid', entry: 'd' })
    expect(parseHash('#equipe')).toEqual({ topic: 'equipe', entry: null })
    expect(parseHash('')).toEqual({ topic: 'visao', entry: null })
    expect(parseHash('#grupo-solid')).toEqual({ topic: 'visao', entry: null })
    expect(TOPICS).toHaveLength(7)
  })

  it('dedent tira só a indentação comum', () => {
    expect(dedent('    a\n      b\n\n    c')).toBe('a\n  b\n\nc')
  })
})
