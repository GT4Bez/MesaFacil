import { act, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePolling } from '../../src/hooks/usePolling'
import Cashier from '../../src/pages/Cashier'
import Tables from '../../src/pages/Tables'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const ok = (data) => jsonResponse({ success: true, data })
const tick = (ms) => act(() => vi.advanceTimersByTimeAsync(ms))

let visibility = 'visible'
function setVisibility(state) {
  visibility = state
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})
afterEach(() => {
  vi.useRealTimers()
  delete document.visibilityState
})

describe('usePolling (spec 020)', () => {
  it('chama a cada intervalo e não sobrepõe chamadas lentas', async () => {
    let release
    const callback = vi.fn(() => new Promise((resolve) => (release = resolve)))
    renderHook(() => usePolling(callback, 1000))
    expect(callback).not.toHaveBeenCalled()

    await tick(1000)
    expect(callback).toHaveBeenCalledTimes(1)
    await tick(5000) // a primeira ainda não terminou: nada novo
    expect(callback).toHaveBeenCalledTimes(1)

    await act(async () => release())
    await tick(1000)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('pausa com a aba oculta e atualiza na hora ao voltar', async () => {
    const callback = vi.fn(async () => {})
    renderHook(() => usePolling(callback, 1000))
    await tick(1000)
    expect(callback).toHaveBeenCalledTimes(1)

    act(() => setVisibility('hidden'))
    await tick(10000)
    expect(callback).toHaveBeenCalledTimes(1)

    act(() => setVisibility('visible'))
    await tick(0)
    expect(callback).toHaveBeenCalledTimes(2)
    await tick(1000)
    expect(callback).toHaveBeenCalledTimes(3)
  })

  it('pausa com enabled: false e retoma ao reativar', async () => {
    const callback = vi.fn(async () => {})
    const { rerender } = renderHook(({ enabled }) => usePolling(callback, 1000, { enabled }), {
      initialProps: { enabled: false },
    })
    await tick(5000)
    expect(callback).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await tick(1000)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('para ao desmontar; isActive() fica falso para a resposta atrasada', async () => {
    let release
    let isActive
    const callback = vi.fn((active) => {
      isActive = active
      return new Promise((resolve) => (release = resolve))
    })
    const { unmount } = renderHook(() => usePolling(callback, 1000))
    await tick(1000)
    expect(isActive()).toBe(true)
    unmount()
    expect(isActive()).toBe(false)
    await act(async () => release())
    await tick(5000)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('erro vira `error` e some na próxima atualização bem-sucedida', async () => {
    let fail = true
    const callback = vi.fn(async () => {
      if (fail) throw new Error('Não foi possível conectar ao servidor.')
    })
    const { result } = renderHook(() => usePolling(callback, 1000))
    await tick(1000)
    expect(result.current.error).toBe('Não foi possível conectar ao servidor.')
    fail = false
    await tick(1000)
    expect(result.current.error).toBe('')
  })
})

const waiter = { id: '2', name: 'Garçom', email: 'g@m.com', role: 'waiter' }
const cashier = { id: '3', name: 'Caixa', email: 'cx@m.com', role: 'cashier' }

describe('Salão atualiza sozinho (spec 020)', () => {
  it('a mesa que pediu a conta em outro terminal ganha a tag; erro de rede avisa sem apagar o mapa', async () => {
    let orderStatus = 'in_kitchen'
    let offline = false
    mockFetch(
      {
        'GET /tables': () => {
          if (offline) throw new TypeError('Failed to fetch')
          return ok([{ id: '1', number: 1, status: 'occupied', activeOrderId: '10', orderStatus }])
        },
        'GET /shifts/active': () => ok({ id: '5', status: 'open' }),
      },
      waiter,
    )
    renderWithAuth(<Tables />, { user: waiter, route: '/tables', path: '/tables' })
    expect(await screen.findByRole('button', { name: /MESA\s*Ocupada\s*1/ })).toBeInTheDocument()
    expect(screen.getByText(/Atualizado às/)).toBeInTheDocument()

    orderStatus = 'ready_to_pay'
    await tick(10000)
    expect(await screen.findByRole('button', { name: /MESA\s*Aguardando pagamento\s*1/ })).toBeInTheDocument()

    offline = true
    await tick(10000)
    expect(await screen.findByText('Sem conexão com o servidor. Tentando de novo...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /MESA\s*Aguardando pagamento\s*1/ })).toBeInTheDocument()

    offline = false
    await tick(10000)
    await waitFor(() => expect(screen.queryByText(/Sem conexão/)).not.toBeInTheDocument())
  })
})

describe('Caixa atualiza sozinho (spec 020)', () => {
  function renderCashier(server) {
    const calls = { bill: 0 }
    mockFetch(
      {
        'GET /tables': () => ok(server.tables()),
        'GET /orders/30/bill': () => {
          calls.bill += 1
          return ok({
            orderId: '30', status: server.status, serviceTax: false, subtotal: server.total, serviceTaxAmount: 0,
            total: server.total, remainingBalance: server.total,
            items: [{ id: '1', name: 'Picanha', quantity: 1, unitPrice: server.total, status: 'ready' }], payments: [],
          })
        },
        'GET /shifts/active': () => ok(null),
      },
      cashier,
    )
    renderWithAuth(<Cashier />, { user: cashier, route: '/cashier', path: '/cashier' })
    return calls
  }
  const table = (orderStatus) => ({ id: '3', number: 3, status: 'occupied', activeOrderId: '30', orderStatus })

  it('lista e extrato atualizam; o valor digitado no pagamento sobrevive; conta encerrada some com aviso', async () => {
    const server = { status: 'in_kitchen', total: 89.9, tables: () => [table(server.status)] }
    renderCashier(server)
    fireEvent.click(await screen.findByRole('button', { name: /Mesa 3/ }))
    expect(await screen.findByText('Na cozinha')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: /Forma de pagamento/i }), { target: { value: 'pix' } })
    fireEvent.change(screen.getByLabelText(/Valor/), { target: { value: '50' } })

    // O garçom pediu a conta e lançou um item antes: a lista e o extrato mudam sozinhos.
    server.status = 'ready_to_pay'
    server.total = 96.9
    await tick(10000)
    expect(await screen.findByText('Aguardando pagamento', { selector: '.order-status-line b' })).toBeInTheDocument()
    expect(within(document.querySelector('.cash-table')).getByText('Aguardando pagamento')).toBeInTheDocument()
    expect(screen.getAllByText(/96,90/).length).toBeGreaterThan(0)
    expect(screen.getByLabelText(/Valor/)).toHaveValue(50)
    expect(screen.getByRole('combobox', { name: /Forma de pagamento/i })).toHaveValue('pix')

    // Encerrada em outro terminal.
    server.status = 'closed'
    server.tables = () => []
    await tick(10000)
    expect(await screen.findByText('A comanda #30 não está mais ativa.')).toBeInTheDocument()
    expect(screen.getByText('O extrato da conta aparecerá aqui.')).toBeInTheDocument()
  })

  it('não atualiza com o modal de reabertura aberto', async () => {
    const server = { status: 'ready_to_pay', total: 89.9, tables: () => [table('ready_to_pay')] }
    const calls = renderCashier(server)
    fireEvent.click(await screen.findByRole('button', { name: /Mesa 3/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reabrir conta' }))
    await screen.findByRole('dialog', { name: 'Reabrir a conta #30' })
    const before = calls.bill
    await tick(30000)
    expect(calls.bill).toBe(before)
  })
})
