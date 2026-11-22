import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MenuAdmin from '../../src/pages/MenuAdmin'
import Users from '../../src/pages/Users'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

describe('Formulários de administração em modal (spec 012)', () => {
  it('Admin do cardápio: editar abre o modal preenchido, salva, fecha e avisa', async () => {
    const manager = { id: '4', name: 'Gerente', email: 'ger@m.com', role: 'manager' }
    let items = [{ id: '1', name: 'Picanha', category: 'Pratos', price: 89.9, available: true }]
    const fetchSpy = mockFetch(
      {
        'GET /menu-items': () => jsonResponse({ success: true, data: items }),
        'GET /menu-items/categories': ['Pratos'],
        'PATCH /menu-items/1': ({ body }) => {
          items = [{ ...items[0], ...body }]
          return jsonResponse({ success: true, data: items[0] })
        },
      },
      manager,
    )
    renderWithAuth(<MenuAdmin />, { user: manager, route: '/admin/menu', path: '/admin/menu' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar: Picanha' })
    expect(within(dialog).getByLabelText('Preço (R$)')).toHaveValue(89.9)
    fireEvent.change(within(dialog).getByLabelText('Preço (R$)'), { target: { value: '95' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/menu-items\/1$/),
        expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"price":95') }),
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Picanha: alterações salvas')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Admin do cardápio: erro da API fica dentro do modal de novo item', async () => {
    const manager = { id: '4', name: 'Gerente', email: 'ger@m.com', role: 'manager' }
    mockFetch(
      {
        'GET /menu-items': [],
        'GET /menu-items/categories': [],
        'POST /menu-items': () => jsonResponse({ success: false, error: 'Dados inválidos.' }, 422),
      },
      manager,
    )
    renderWithAuth(<MenuAdmin />, { user: manager, route: '/admin/menu', path: '/admin/menu' })
    fireEvent.click(await screen.findByRole('button', { name: '+ Novo item' }))
    const dialog = screen.getByRole('dialog', { name: 'Novo item' })
    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Moqueca' } })
    fireEvent.change(within(dialog).getByLabelText('Categoria'), { target: { value: 'Pratos' } })
    fireEvent.change(within(dialog).getByLabelText('Preço (R$)'), { target: { value: '79.9' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cadastrar item' }))
    expect(await within(dialog).findByText('Dados inválidos.')).toBeInTheDocument()
  })

  it('Usuários: novo usuário em modal; redefinir senha também em modal', async () => {
    const admin = { id: '1', name: 'Admin', email: 'admin@mesafacil.com', role: 'admin', active: true }
    const fetchSpy = mockFetch(
      {
        'GET /users': [admin],
        'POST /users': ({ body }) => jsonResponse({ success: true, data: { id: '9', ...body, active: true } }, 201),
        'PUT /users/1/password': () => jsonResponse({ success: true, data: { id: '1' } }),
      },
      admin,
    )
    renderWithAuth(<Users />, { user: admin, route: '/admin/users', path: '/admin/users' })

    fireEvent.click(await screen.findByRole('button', { name: '+ Novo usuário' }))
    const dialog = screen.getByRole('dialog', { name: 'Novo usuário' })
    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Ana' } })
    fireEvent.change(within(dialog).getByLabelText('E-mail'), { target: { value: 'ana@mesafacil.com' } })
    fireEvent.change(within(dialog).getByLabelText('Senha inicial'), { target: { value: 'senha-forte-1' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cadastrar usuário' }))
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringMatching(/\/users$/), expect.objectContaining({ method: 'POST' })),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Ana cadastrado(a) na equipe')

    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }))
    const reset = screen.getByRole('dialog', { name: 'Redefinir senha de Admin' })
    fireEvent.change(within(reset).getByLabelText('Nova senha'), { target: { value: 'outra-senha-1' } })
    fireEvent.click(within(reset).getByRole('button', { name: 'Redefinir senha' }))
    expect(await within(reset).findByText(/Senha redefinida/)).toBeInTheDocument()
  })
})
