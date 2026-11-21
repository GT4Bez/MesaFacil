import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAction } from '../../src/hooks/useAction'

describe('useAction hook', () => {
  it('executa ação com sucesso, gerencia error e permite limpar via clearError', async () => {
    const { result } = renderHook(() => useAction())

    let ok
    await act(async () => {
      ok = await result.current.run(async () => {
        throw new Error('Falha de validação')
      })
    })
    expect(ok).toBe(false)
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toBe('Falha de validação')

    act(() => result.current.clearError())
    expect(result.current.error).toBe('')

    await act(async () => {
      ok = await result.current.run(async () => {})
    })
    expect(ok).toBe(true)
    expect(result.current.error).toBe('')
  })
})
