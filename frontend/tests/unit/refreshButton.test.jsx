import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RefreshButton } from '../../src/components/RefreshStatus'

const icon = () => screen.getByRole('button').querySelector('.refresh-icon')

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

describe('Botão "Atualizar" animado', () => {
  it('gira durante a atualização manual e dá ao menos uma volta inteira', async () => {
    let finish
    const onRefresh = vi.fn(() => new Promise((resolve) => (finish = resolve)))
    render(<RefreshButton onRefresh={onRefresh} />)
    const button = screen.getByRole('button', { name: 'Atualizar' })
    expect(icon()).not.toHaveClass('spinning')

    fireEvent.click(button)
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(icon()).toHaveClass('spinning')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')

    // Resposta rápida: o giro continua até completar 700 ms.
    await act(async () => finish())
    expect(button).toBeEnabled()
    expect(icon()).toHaveClass('spinning')
    await act(() => vi.advanceTimersByTimeAsync(700))
    expect(icon()).not.toHaveClass('spinning')
    expect(button).toHaveAttribute('aria-busy', 'false')
  })

  it('gira enquanto a atualização automática está em andamento', async () => {
    const { rerender } = render(<RefreshButton onRefresh={() => {}} polling label="Atualizar mesas" />)
    expect(screen.getByRole('button', { name: 'Atualizar mesas' })).toBeEnabled()
    expect(icon()).toHaveClass('spinning')
    rerender(<RefreshButton onRefresh={() => {}} polling={false} label="Atualizar mesas" />)
    await act(() => vi.advanceTimersByTimeAsync(700))
    expect(icon()).not.toHaveClass('spinning')
  })

  it('o ícone é decorativo: o nome do botão é só o texto', () => {
    render(<RefreshButton onRefresh={() => {}} />)
    expect(icon()).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button')).toHaveAccessibleName('Atualizar')
  })
})
