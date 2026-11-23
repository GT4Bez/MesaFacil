import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Ingredients from '../../src/pages/Ingredients'
import { summaryText } from '../../src/components/IngredientHistoryModal'
import { jsonResponse, mockFetch, renderWithAuth } from '../support/helpers'

const manager = { id: '4', name: 'Gerente', email: 'ger@m.com', role: 'manager' }
const picanha = { id: '3', name: 'Picanha', unit: 'kg', stockQuantity: 4.85, minStock: 2, unitCost: 79.9, active: true, belowMin: false }
const SALE = {
  id: '9', type: 'sale', quantity: -0.3, unitCost: 79.9, balanceAfter: 4.85, createdAt: new Date().toISOString(), by: 'Garçom',
  reason: null, shiftId: '7', sale: { orderId: '42', tableNumber: 5, menuItem: 'Picanha na chapa', itemQuantity: 1 },
}
const SUMMARY = { count: 3, in: 5, out: -0.45, net: 4.55 }

async function openHistory({ activeShift = { id: '7' }, csv } = {}) {
  const requests = []
  const downloads = []
  mockFetch(
    {
      'GET /ingredients': [picanha],
      'GET /shifts/active': activeShift === null ? { body: { success: true, data: null } } : activeShift,
      'GET /ingredients/3/movements': ({ url }) => {
        const params = Object.fromEntries(new URL(String(url), 'http://localhost').searchParams)
        requests.push(params)
        const filtered = Object.keys(params).length > 0
        return jsonResponse({
          success: true,
          data: { ingredient: picanha, consistent: true, summary: filtered ? SUMMARY : null, movements: [SALE], nextBefore: null },
        })
      },
      'GET /ingredients/3/movements.csv': ({ url }) => {
        downloads.push(Object.fromEntries(new URL(String(url), 'http://localhost').searchParams))
        return csv()
      },
    },
    manager,
  )
  renderWithAuth(<Ingredients />, { user: manager, route: '/admin/ingredients', path: '/admin/ingredients' })
  const card = await screen.findByRole('article', { name: 'Picanha' })
  fireEvent.click(within(card).getByRole('button', { name: 'Histórico' }))
  const dialog = await screen.findByRole('dialog', { name: 'Histórico · Picanha' })
  await waitFor(() => expect(requests).toHaveLength(1))
  return { dialog, requests, downloads }
}

describe('Histórico do insumo por período, turno e CSV (spec 018)', () => {
  let clicked
  beforeEach(() => {
    clicked = []
    URL.createObjectURL = vi.fn(() => 'blob:csv')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clicked.push({ href: this.href, download: this.download })
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('período e "Só o turno atual" mudam a query; o resumo aparece; "Limpar filtros" volta ao início', async () => {
    const { dialog, requests } = await openHistory()
    expect(requests[0]).toEqual({})
    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('De'), { target: { value: '2026-11-23' } })
    fireEvent.change(within(dialog).getByLabelText('Até'), { target: { value: '2026-11-23' } })
    await waitFor(() => expect(requests.at(-1)).toHaveProperty('to'))
    expect(new Date(requests.at(-1).from).getTime()).toBe(new Date('2026-11-23T00:00:00').getTime())
    expect(new Date(requests.at(-1).to).getTime()).toBe(new Date('2026-11-24T00:00:00').getTime())

    const shift = within(dialog).getByRole('button', { name: 'Só o turno atual' })
    expect(shift).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(shift)
    expect(shift).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(requests.at(-1)).toMatchObject({ shiftId: '7' }))
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      '3 movimentos · entradas +5 kg · saídas −0,45 kg · líquido +4,55 kg',
    )

    fireEvent.click(within(dialog).getByRole('button', { name: 'Limpar filtros' }))
    await waitFor(() => expect(requests.at(-1)).toEqual({}))
    expect(shift).toHaveAttribute('aria-pressed', 'false')
  })

  it('sem turno aberto, "Só o turno atual" fica desabilitado com a dica', async () => {
    const { dialog } = await openHistory({ activeShift: null })
    const shift = within(dialog).getByRole('button', { name: 'Só o turno atual' })
    expect(shift).toBeDisabled()
    expect(shift).toHaveAccessibleDescription('Nenhum turno aberto')
  })

  it('"Exportar CSV" baixa com os filtros atuais e o nome do Content-Disposition', async () => {
    let finish
    const { dialog, downloads } = await openHistory({
      csv: () =>
        new Promise((resolve) => {
          finish = () =>
            resolve(
              new Response('﻿id;data\r\n', {
                status: 200,
                headers: {
                  'Content-Type': 'text/csv; charset=utf-8',
                  'Content-Disposition': 'attachment; filename="historico-picanha-2026-11-23.csv"',
                },
              }),
            )
        }),
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vendas' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Só o turno atual' }))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Exportar CSV' }))
    const exporting = await within(dialog).findByRole('button', { name: 'Exportando...' })
    expect(exporting).toBeDisabled()
    await waitFor(() => expect(downloads).toEqual([{ type: 'sale', shiftId: '7' }]))
    finish()
    await waitFor(() => expect(clicked).toEqual([{ href: 'blob:csv', download: 'historico-picanha-2026-11-23.csv' }]))
    expect(within(dialog).getByRole('button', { name: 'Exportar CSV' })).toBeEnabled()
    expect(URL.createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob)
  })

  it('erro da exportação aparece no modal', async () => {
    const { dialog } = await openHistory({
      csv: () =>
        jsonResponse(
          { success: false, error: 'O recorte tem mais de 10.000 movimentos. Diminua o período.', code: 'VALIDATION_ERROR' },
          422,
        ),
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Exportar CSV' }))
    expect(await within(dialog).findByText('O recorte tem mais de 10.000 movimentos. Diminua o período.')).toBeInTheDocument()
    expect(clicked).toEqual([])
    expect(within(dialog).getAllByRole('row')).toHaveLength(2)
  })

  it('summaryText usa singular, sinais e zero sem sinal', () => {
    expect(summaryText({ count: 1, in: 0, out: -0.3, net: -0.3 }, 'kg')).toBe(
      '1 movimento · entradas 0 kg · saídas −0,3 kg · líquido −0,3 kg',
    )
  })
})
