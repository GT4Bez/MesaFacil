import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Audit, { auditUrl } from '../../src/pages/Audit'
import { describeAudit } from '../../src/utils/auditLabels'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const manager = { id: '2', name: 'Gerente', email: 'ger@m.com', role: 'manager' }
const admin = { id: '1', name: 'Admin', email: 'adm@m.com', role: 'admin' }
const now = new Date().toISOString()
const cashier = { id: '4', name: 'Caixa', role: 'cashier' }

const entry = (id, action, details = {}, target = null, user = cashier) => ({
  id, action, createdAt: now, shiftId: '7', user, entity: 'x', entityId: '1', details, target,
})
const CANCEL = entry('9', 'order_item.canceled',
  { orderId: '42', reason: 'Cliente desistiu', previousStatus: 'sent', approvedBy: { id: '2', name: 'Gerente' } },
  { orderId: '42', tableNumber: 5, menuItem: 'Picanha na chapa' })
const WITHDRAWAL = entry('8', 'cash.withdrawal', { amount: 250, reason: 'Gás', approvedBy: { id: '2', name: 'Gerente' } })
const PRICE = entry('5', 'menu_item.price_changed', { from: 89.9, to: 94.9 }, { name: 'Picanha na chapa' }, { ...manager })
const UNKNOWN = entry('3', 'coisa.nova', { x: 1 })

async function openAudit(user, handler) {
  const requests = []
  mockFetch(
    {
      'GET /audit-logs/actors': { actors: [{ ...cashier, active: true }, { id: '6', name: 'Zé', role: 'waiter', active: false }] },
      'GET /audit-logs': ({ url }) => {
        const params = new URL(String(url), 'http://localhost').searchParams
        requests.push(Object.fromEntries(params))
        return jsonResponse({ success: true, data: handler(params) })
      },
    },
    user,
  )
  renderWithAuth(<Audit />, { user, route: '/admin/audit', path: '/admin/audit' })
  await screen.findByRole('heading', { name: 'Auditoria' })
  return { requests }
}

const items = () => within(screen.getByRole('list')).getAllByRole('listitem').map((item) => item.textContent)

describe('Tela de auditoria (RN-20, spec 017)', () => {
  it('lista os registros com resumo legível e "Carregar mais" acrescenta a próxima página', async () => {
    const { requests } = await openAudit(manager, (params) =>
      params.get('before') === '8'
        ? { entries: [PRICE, UNKNOWN], nextBefore: null }
        : { entries: [CANCEL, WITHDRAWAL], nextBefore: '8' },
    )
    await waitFor(() => expect(items()).toHaveLength(2))
    expect(items()[0]).toContain('Cancelou item')
    expect(items()[0]).toContain('Pedido 42 · Mesa 5 · Picanha na chapa · Motivo: Cliente desistiu · autorizado por Gerente')
    expect(items()[0]).toContain('Caixa · Caixa')
    expect(items()[1]).toMatch(/Sangria.*R\$\s250,00 · Gás · autorizada por Gerente/)

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }))
    await waitFor(() => expect(items()).toHaveLength(4))
    expect(items()[2]).toMatch(/Mudou o preço.*Picanha na chapa: R\$\s89,90 → R\$\s94,90/)
    // Ação desconhecida aparece com o código cru, sem quebrar a tela.
    expect(items()[3]).toContain('coisa.nova')
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument()
    expect(requests.at(-1)).toEqual({ before: '8' })
  })

  it('filtros recarregam do início com categoria, quem fez, turno e período', async () => {
    const { requests } = await openAudit(manager, (params) =>
      params.get('category') === 'cash' ? { entries: [WITHDRAWAL], nextBefore: null } : { entries: [CANCEL, WITHDRAWAL], nextBefore: null },
    )
    await waitFor(() => expect(items()).toHaveLength(2))

    const cash = screen.getByRole('button', { name: 'Caixa' })
    fireEvent.click(cash)
    expect(cash).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(items()).toHaveLength(1))
    expect(requests.at(-1)).toEqual({ category: 'cash' })

    const who = screen.getByRole('combobox', { name: 'Quem fez' })
    expect(within(who).getByRole('option', { name: 'Zé · Garçom (inativo)' })).toBeInTheDocument()
    fireEvent.change(who, { target: { value: '4' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Turno' }), { target: { value: '7a' } })
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-11-20' } })
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-11-22' } })
    await waitFor(() => expect(requests.at(-1)).toMatchObject({ category: 'cash', userId: '4', shiftId: '7' }))
    const last = requests.at(-1)
    expect(new Date(last.from).getTime()).toBe(new Date('2026-11-20T00:00:00').getTime())
    expect(new Date(last.to).getTime()).toBe(new Date('2026-11-23T00:00:00').getTime())

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    await waitFor(() => expect(requests.at(-1)).toEqual({}))
  })

  it('o gerente não vê a categoria "Usuários"; o admin vê', async () => {
    await openAudit(manager, () => ({ entries: [], nextBefore: null }))
    expect(await screen.findByText('Nenhum registro para esses filtros.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Usuários' })).not.toBeInTheDocument()
  })

  it('o admin vê a categoria "Usuários"', async () => {
    const { requests } = await openAudit(admin, () => ({ entries: [], nextBefore: null }))
    fireEvent.click(screen.getByRole('button', { name: 'Usuários' }))
    await waitFor(() => expect(requests.at(-1)).toEqual({ category: 'users' }))
  })

  it('o erro da API aparece na tela', async () => {
    mockFetch({
      'GET /audit-logs/actors': { actors: [] },
      'GET /audit-logs': { body: { success: false, error: 'from deve ser anterior a to.', code: 'VALIDATION_ERROR' }, status: 422 },
    }, manager)
    renderWithAuth(<Audit />, { user: manager, route: '/admin/audit', path: '/admin/audit' })
    expect(await screen.findByText('from deve ser anterior a to.')).toBeInTheDocument()
  })

  it('auditUrl monta a query só com os filtros preenchidos', () => {
    expect(auditUrl({ category: null, userId: '', shiftId: '', from: '', to: '' })).toBe('/audit-logs')
    expect(auditUrl({ category: 'cash', userId: '', shiftId: '3', from: '', to: '' }, '10')).toBe(
      '/audit-logs?category=cash&shiftId=3&before=10',
    )
  })

  it('describeAudit cobre ajuste de estoque, bloqueio e edição de usuário', () => {
    expect(describeAudit(entry('1', 'stock.adjusted', { from: 4.85, to: 4.5, difference: -0.35, reason: 'Quebra' }, { name: 'Picanha', unit: 'kg' })).summary)
      .toBe('Picanha: 4,85 kg → 4,5 kg (−0,35 kg) · Motivo: Quebra')
    expect(describeAudit(entry('1', 'auth.approval_locked', { approverEmail: 'ger@m.com' }))).toEqual({
      title: 'Autorização bloqueada',
      summary: 'Excesso de tentativas · e-mail tentado: ger@m.com',
    })
    expect(describeAudit(entry('1', 'user.updated', { changes: { role: { from: 'waiter', to: 'manager' }, active: { from: true, to: false } } }, { name: 'Zé', role: 'manager' })).summary)
      .toBe('Zé · papel: Garçom → Gerente, ativo: sim → não')
    expect(describeAudit(entry('1', 'shift.counted', { declared: { pix: 3, card: 2, cash: 1 }, note: null })).summary)
      .toMatch(/^Dinheiro R\$\s1,00, Cartão R\$\s2,00, Pix R\$\s3,00$/)
    // Detalhes inesperados não quebram.
    expect(describeAudit({ ...entry('1', 'stock.adjusted'), details: null }).title).toBe('Ajustou o estoque')
  })
})
