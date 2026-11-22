import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Cashier from '../../src/pages/Cashier'
import ShiftAdmin from '../../src/pages/ShiftAdmin'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const cashier = { id: '3', name: 'Caixa', email: 'cx@m.com', role: 'cashier' }
const manager = { id: '4', name: 'Gerente', email: 'g@m.com', role: 'manager' }
const ok = (data) => () => jsonResponse({ success: true, data })

const openShift = (extra = {}) => ({ id: '5', status: 'open', openedAt: new Date().toISOString(), countedAt: null, ...extra })
const closing = (cashDeclared, extra = {}) => ({
  countedBy: 'Caixa',
  countedAt: new Date().toISOString(),
  note: null,
  reason: null,
  stale: false,
  methods: [
    { method: 'cash', declared: cashDeclared, expected: 140, difference: Math.round((cashDeclared - 140) * 100) / 100 },
    { method: 'card', declared: 0, expected: 0, difference: 0 },
    { method: 'pix', declared: 49.9, expected: 49.9, difference: 0 },
  ],
  ...extra,
})
const report = (shift, closingBlock) => ({
  shift: { ...shift, openedBy: 'Gerente', closedBy: null },
  totalShift: 99.9,
  ordersClosed: 1,
  averageTicket: 99.9,
  byPaymentMethod: [],
  byMenuItem: [],
  cancellations: { ordersCount: 0, orders: [], items: [] },
  cash: { openingFloat: 100, cashPayments: 50, withdrawals: 30, reinforcements: 20, expected: 140, movements: [] },
  closing: closingBlock,
})

describe('Conferência cega no fechamento do turno (RN-14)', () => {
  it('caixa informa dinheiro, cartão e Pix sem ver nenhum valor esperado', async () => {
    const sent = []
    mockFetch(
      {
        'GET /tables': [],
        'GET /shifts/active': ok(openShift()),
        'GET /shifts/5/cash-movements': ok([]),
        'PUT /shifts/5/count': ({ body }) => {
          sent.push(body)
          return jsonResponse({
            success: true,
            data: { shiftId: '5', countedAt: '2026-11-22T22:05:00.000Z', declared: body.declared, note: null },
          })
        },
      },
      cashier,
    )
    renderWithAuth(<Cashier />, { user: cashier, route: '/cashier', path: '/cashier' })

    fireEvent.change(await screen.findByLabelText('Dinheiro contado (R$)'), { target: { value: '137.5' } })
    fireEvent.change(screen.getByLabelText('Cartão contado (R$)'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Pix contado (R$)'), { target: { value: '49.9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar contagem' }))

    expect(await screen.findByText(/Contagem registrada às/)).toBeInTheDocument()
    expect(sent).toEqual([{ declared: { cash: 137.5, card: 0, pix: 49.9 }, note: '' }])
    expect(screen.queryByText(/esperado/i)).not.toBeInTheDocument()
  })

  it('gerente vê declarado × esperado × diferença e precisa informar o motivo', async () => {
    const sent = []
    let shift = openShift({ countedAt: new Date().toISOString() })
    mockFetch(
      {
        'GET /shifts/active': () => jsonResponse({ success: true, data: shift.status === 'open' ? shift : null }),
        'GET /shifts/5/report': () =>
          jsonResponse({ success: true, data: report(shift, closing(137.5, shift.status === 'closed' ? { reason: 'Faltou troco' } : {})) }),
        'PATCH /shifts/5/close': ({ body }) => {
          sent.push(body)
          shift = { ...shift, status: 'closed', closedAt: new Date().toISOString() }
          return jsonResponse({ success: true, data: shift })
        },
      },
      manager,
    )
    renderWithAuth(<ShiftAdmin />, { user: manager, route: '/admin/shift', path: '/admin/shift' })

    const panel = await screen.findByRole('region', { name: 'Conferência' })
    const cashRow = within(panel).getByRole('row', { name: /Dinheiro/ })
    expect(cashRow).toHaveTextContent(/R\$\s*137,50/)
    expect(cashRow).toHaveTextContent(/R\$\s*140,00/)
    expect(within(cashRow).getByText(/-R\$\s*2,50|R\$\s*-2,50/)).toHaveClass('diff-negative')

    const reason = within(panel).getByLabelText('Motivo da diferença')
    expect(reason).toBeRequired()
    fireEvent.change(reason, { target: { value: ' Faltou troco ' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Encerrar turno' }))

    expect(await screen.findByText(/Motivo da diferença: Faltou troco/)).toBeInTheDocument()
    expect(sent).toEqual([{ reason: 'Faltou troco' }])
  })

  it('sem contagem, ou com contagem desatualizada, o encerramento fica bloqueado', async () => {
    let block = null
    mockFetch(
      {
        'GET /shifts/active': ok(openShift()),
        'GET /shifts/5/report': () => jsonResponse({ success: true, data: report(openShift(), block) }),
      },
      manager,
    )
    const { unmount } = renderWithAuth(<ShiftAdmin />, { user: manager, route: '/admin/shift', path: '/admin/shift' })
    const panel = await screen.findByRole('region', { name: 'Conferência' })
    expect(within(panel).getByText(/O caixa ainda não fez a contagem/)).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Encerrar turno' })).toBeDisabled()
    unmount()

    block = closing(140, { stale: true })
    renderWithAuth(<ShiftAdmin />, { user: manager, route: '/admin/shift', path: '/admin/shift' })
    const stalePanel = await screen.findByRole('region', { name: 'Conferência' })
    expect(within(stalePanel).getByText(/peça ao caixa uma nova contagem/)).toBeInTheDocument()
    expect(within(stalePanel).getByRole('button', { name: 'Encerrar turno' })).toBeDisabled()
  })

  it('gerente no Caixa não vê o formulário de contagem, que é do caixa', async () => {
    mockFetch(
      {
        'GET /tables': [],
        'GET /shifts/active': ok(openShift()),
        'GET /shifts/5/cash-movements': ok([]),
      },
      manager,
    )
    renderWithAuth(<Cashier />, { user: manager, route: '/cashier', path: '/cashier' })
    expect(await screen.findByText(/A contagem cega é feita pelo caixa \(ainda pendente\)/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Dinheiro contado (R$)')).not.toBeInTheDocument()
  })

  it('motivo só com espaços não encerra o turno', async () => {
    const sent = []
    mockFetch(
      {
        'GET /shifts/active': ok(openShift({ countedAt: new Date().toISOString() })),
        'GET /shifts/5/report': ok(report(openShift(), closing(137.5))),
        'PATCH /shifts/5/close': ({ body }) => {
          sent.push(body)
          return jsonResponse({ success: true, data: {} })
        },
      },
      manager,
    )
    renderWithAuth(<ShiftAdmin />, { user: manager, route: '/admin/shift', path: '/admin/shift' })
    const panel = await screen.findByRole('region', { name: 'Conferência' })
    const reason = within(panel).getByLabelText('Motivo da diferença')
    fireEvent.change(reason, { target: { value: '   ' } })
    fireEvent.submit(reason.closest('form'))
    expect(reason).toHaveValue('')
    expect(sent).toEqual([])
  })
})
