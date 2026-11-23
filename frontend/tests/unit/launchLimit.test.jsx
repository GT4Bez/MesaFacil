import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Order from '../../src/pages/Order'
import Settings from '../../src/pages/Settings'
import { describeAudit } from '../../src/utils/auditLabels'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const waiter = { id: '2', name: 'Garçom', email: 'g@m.com', role: 'waiter' }
const manager = { id: '3', name: 'Gerente', email: 'ger@m.com', role: 'manager' }
const admin = { id: '1', name: 'Administrador', email: 'adm@m.com', role: 'admin' }
const ok = (data) => jsonResponse({ success: true, data })
const menu = [{ id: '1', name: 'Picanha', category: 'Pratos', price: 89.9 }]

async function openAddModal(user, limit = 3) {
  const order = { id: '10', status: 'open', createdAt: new Date().toISOString(), table: { number: 4 }, cancellation: null, items: [] }
  mockFetch(
    {
      'GET /orders/10': () => ok(order),
      'GET /menu-items': menu,
      'GET /settings': () => ok({ maxItemQuantityPerLaunch: limit, updatedAt: null, updatedBy: null }),
    },
    user,
  )
  renderWithAuth(<Order />, { user, route: '/orders/10', path: '/orders/:id' })
  fireEvent.click(await screen.findByRole('button', { name: /Picanha/ }))
  return screen.getByRole('dialog', { name: 'Picanha' })
}

const plus = (dialog) => within(dialog).getByRole('button', { name: 'Aumentar quantidade' })

describe('Limite de itens por lançamento (RN-21, spec 022)', () => {
  it('garçom: o seletor para no limite e mostra a dica', async () => {
    const dialog = await openAddModal(waiter, 3)
    expect(await within(dialog).findByText('Máximo de 3 por lançamento.')).toBeInTheDocument()
    fireEvent.click(plus(dialog))
    fireEvent.click(plus(dialog))
    expect(within(dialog).getByText('3')).toBeInTheDocument()
    expect(plus(dialog)).toBeDisabled()
  })

  it('gerente: sem o limite do garçom (o seletor segue até 99) e sem a dica', async () => {
    const dialog = await openAddModal(manager, 3)
    for (let i = 0; i < 3; i++) fireEvent.click(plus(dialog))
    expect(within(dialog).getByText('4')).toBeInTheDocument()
    expect(plus(dialog)).toBeEnabled()
    expect(within(dialog).queryByText(/por lançamento/)).not.toBeInTheDocument()
  })

  it('Configurações: carrega, salva o novo limite e mostra quem alterou', async () => {
    const patches = []
    let current = { maxItemQuantityPerLaunch: 10, updatedAt: null, updatedBy: null }
    mockFetch(
      {
        'GET /settings': () => ok(current),
        'PATCH /settings': ({ body }) => {
          patches.push(body)
          current = { maxItemQuantityPerLaunch: body.maxItemQuantityPerLaunch, updatedAt: new Date().toISOString(), updatedBy: 'Administrador' }
          return ok(current)
        },
      },
      admin,
    )
    renderWithAuth(<Settings />, { user: admin, route: '/admin/settings', path: '/admin/settings' })
    const field = await screen.findByLabelText('Máximo de unidades iguais por lançamento do garçom')
    expect(field).toHaveValue(10)
    expect(screen.getByText('Usando o padrão do sistema (10).')).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Salvar' })
    expect(save).toBeDisabled()

    fireEvent.change(field, { target: { value: '15' } })
    fireEvent.click(save)
    await waitFor(() => expect(patches).toEqual([{ maxItemQuantityPerLaunch: 15 }]))
    expect(await screen.findByText('Configuração salva.')).toBeInTheDocument()
    expect(screen.getByText(/^Alterado por Administrador em/)).toBeInTheDocument()
  })

  it('Configurações: o erro da API aparece', async () => {
    mockFetch(
      {
        'GET /settings': () => ok({ maxItemQuantityPerLaunch: 10, updatedAt: null, updatedBy: null }),
        'PATCH /settings': () =>
          jsonResponse(
            { success: false, error: 'O máximo de unidades iguais por lançamento deve ser um número inteiro de 1 a 99.', code: 'VALIDATION_ERROR' },
            422,
          ),
      },
      admin,
    )
    renderWithAuth(<Settings />, { user: admin, route: '/admin/settings', path: '/admin/settings' })
    const field = await screen.findByLabelText('Máximo de unidades iguais por lançamento do garçom')
    fireEvent.change(field, { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(
      await screen.findByText('O máximo de unidades iguais por lançamento deve ser um número inteiro de 1 a 99.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Configuração salva.')).not.toBeInTheDocument()
  })

  it('auditoria descreve a mudança de configuração', () => {
    expect(
      describeAudit({ id: '1', action: 'setting.updated', details: { key: 'max_item_quantity_per_launch', from: 10, to: 15 } }),
    ).toEqual({ title: 'Alterou configuração', summary: 'Máximo por lançamento: 10 → 15' })
  })
})
