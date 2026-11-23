import { describe, expect, it } from 'vitest'
import { hasRole, homeFor, menuFor, SCREENS } from '../../src/utils/access'

describe('access matrix (specs 004 e 011)', () => {
  it('direciona cada papel para sua tela inicial correta', () => {
    expect(homeFor('admin')).toBe('/admin/users')
    expect(homeFor('waiter')).toBe('/tables')
    expect(homeFor('kitchen')).toBe('/kitchen')
    expect(homeFor('cashier')).toBe('/cashier')
    expect(homeFor('manager')).toBe('/tables')
    expect(homeFor('desconhecido')).toBe(SCREENS.tables.path)
  })

  it('admin passa em qualquer checagem via hasRole e vê todas as telas no menu', () => {
    expect(hasRole({ role: 'admin' }, 'waiter')).toBe(true)
    expect(hasRole({ role: 'admin' })).toBe(true)
    expect(hasRole({ role: 'waiter' }, 'manager')).toBe(false)
    expect(menuFor('admin').map((s) => s.path)).toEqual(Object.values(SCREENS).map((s) => s.path))
  })

  it('filtra menu corretamente para cada papel operacional', () => {
    expect(menuFor('waiter').map((s) => s.path)).toEqual(['/tables', '/account'])
    expect(menuFor('kitchen').map((s) => s.path)).toEqual(['/kitchen', '/account'])
    expect(menuFor('cashier').map((s) => s.path)).toEqual(['/tables', '/cashier', '/account'])
    expect(menuFor('manager').map((s) => s.path)).toEqual([
      '/tables',
      '/kitchen',
      '/cashier',
      '/admin/menu',
      '/admin/ingredients',
      '/admin/shift',
      '/admin/audit',
      '/account',
    ])
  })
})
