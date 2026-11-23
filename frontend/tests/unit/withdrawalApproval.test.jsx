import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Cashier from '../../src/pages/Cashier'
import { TOKEN_KEY } from '../../src/services/api'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const now = new Date().toISOString()
const cashier = { id: '3', name: 'Caixa', email: 'cx@m.com', role: 'cashier' }
const manager = { id: '4', name: 'Gerente', email: 'ger@m.com', role: 'manager' }

// Caixa com turno aberto e limite de R$ 200,00; `onPost` responde ao registro do movimento.
async function renderDrawer(user, onPost) {
  const calls = []
  let movements = [{ id: '1', type: 'opening_float', amount: 100, reason: null, by: 'Gerente', approvedBy: null, createdAt: now }]
  mockFetch(
    {
      'GET /tables': [],
      'GET /shifts/active': () =>
        jsonResponse({ success: true, data: { id: '5', status: 'open', countedAt: null, withdrawalApprovalLimit: 200 } }),
      'GET /shifts/5/cash-movements': () => jsonResponse({ success: true, data: movements }),
      'POST /shifts/5/cash-movements': ({ body }) => {
        calls.push(body)
        const res = onPost(body)
        if (res.status === 201) {
          movements = [...movements, { id: String(movements.length + 1), ...body, by: user.name, approvedBy: body.approver ? 'Gerente' : null, createdAt: now }]
        }
        return res
      },
    },
    user,
  )
  renderWithAuth(<Cashier />, { user, route: '/cashier', path: '/cashier' })
  const drawer = (await screen.findByText('Gaveta: sangria e reforço')).closest('section')
  await within(drawer).findByText('Fundo de troco')
  return { drawer, calls }
}

const amountInput = (drawer) => within(drawer).getByLabelText('Valor (R$)')
const approverBlock = (drawer) => within(drawer).queryByRole('group', { name: 'Autorização do gerente' })

describe('Sangria do caixa com limite e autorização do gerente (RN-18)', () => {
  it('o bloco de autorização aparece só para sangria acima do limite', async () => {
    const { drawer } = await renderDrawer(cashier, () => jsonResponse({ success: true, data: {} }, 201))

    fireEvent.change(amountInput(drawer), { target: { value: '200' } })
    expect(approverBlock(drawer)).not.toBeInTheDocument()

    fireEvent.change(amountInput(drawer), { target: { value: '200.01' } })
    expect(approverBlock(drawer)).toBeInTheDocument()
    expect(within(drawer).getByText(/Sangria acima de R\$\s*200,00 precisa da autorização do gerente/)).toBeInTheDocument()

    fireEvent.change(within(drawer).getByLabelText('Movimento'), { target: { value: 'reinforcement' } })
    expect(approverBlock(drawer)).not.toBeInTheDocument()
  })

  it('envia a autorização; 403 aparece no formulário, limpa a senha e não encerra a sessão; depois registra', async () => {
    let attempt = 0
    const { drawer, calls } = await renderDrawer(cashier, () =>
      ++attempt === 1
        ? jsonResponse({ success: false, error: 'Autorização do gerente inválida.', code: 'FORBIDDEN' }, 403)
        : jsonResponse({ success: true, data: { approvedBy: { id: '4', name: 'Gerente' } } }, 201),
    )
    const form = within(drawer)

    fireEvent.change(amountInput(drawer), { target: { value: '350' } })
    fireEvent.change(form.getByLabelText('Motivo'), { target: { value: 'Cofre' } })
    fireEvent.change(form.getByLabelText('E-mail do gerente'), { target: { value: 'gerente@mesafacil.com' } })
    fireEvent.change(form.getByLabelText('Senha do gerente'), { target: { value: 'errada' } })
    fireEvent.click(form.getByRole('button', { name: 'Registrar movimento' }))

    expect(await form.findByText('Autorização do gerente inválida.')).toBeInTheDocument()
    expect(form.getByLabelText('Senha do gerente')).toHaveValue('')
    expect(form.getByLabelText('E-mail do gerente')).toHaveValue('gerente@mesafacil.com')
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-test')

    fireEvent.change(form.getByLabelText('Senha do gerente'), { target: { value: '123' } })
    fireEvent.click(form.getByRole('button', { name: 'Registrar movimento' }))

    expect(await form.findByText('Sangria registrada com sucesso!')).toBeInTheDocument()
    expect(calls).toEqual([
      { type: 'withdrawal', amount: 350, reason: 'Cofre', approver: { email: 'gerente@mesafacil.com', password: 'errada' } },
      { type: 'withdrawal', amount: 350, reason: 'Cofre', approver: { email: 'gerente@mesafacil.com', password: '123' } },
    ])
    await waitFor(() => expect(form.getByText(/autorizada por Gerente/)).toBeInTheDocument())
    expect(approverBlock(drawer)).not.toBeInTheDocument()
    expect(screen.queryByText(/esperado/i)).not.toBeInTheDocument()
  })

  it('sangria até o limite não envia approver; gerente nunca vê o bloco', async () => {
    const { drawer, calls } = await renderDrawer(cashier, () => jsonResponse({ success: true, data: {} }, 201))
    fireEvent.change(amountInput(drawer), { target: { value: '150' } })
    fireEvent.change(within(drawer).getByLabelText('Motivo'), { target: { value: 'Cofre' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Registrar movimento' }))
    await within(drawer).findByText('Sangria registrada com sucesso!')
    expect(calls).toEqual([{ type: 'withdrawal', amount: 150, reason: 'Cofre' }])
  })

  it('gerente logado no Caixa: sem bloco de autorização mesmo acima do limite', async () => {
    const { drawer } = await renderDrawer(manager, () => jsonResponse({ success: true, data: {} }, 201))
    fireEvent.change(amountInput(drawer), { target: { value: '5000' } })
    expect(approverBlock(drawer)).not.toBeInTheDocument()
  })
})
