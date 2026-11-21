import { describe, expect, it, vi } from 'vitest'
import { api, setUnauthorizedHandler, TOKEN_KEY } from '../../src/services/api'
import { jsonResponse } from '../support/helpers'

describe('api client', () => {
  it('envia Bearer token quando presente e extrai payload.data', async () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-demo')
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ success: true, data: [{ id: '1', number: 1 }] }))

    const data = await api.get('/tables')

    expect(data).toEqual([{ id: '1', number: 1 }])
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/tables$/),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer jwt-demo' }),
      }),
    )
  })

  it('aciona onUnauthorized em 401 autenticado fora de /auth/login (RN-16)', async () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-revogado')
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ success: false, error: 'Sessão encerrada.' }, 401),
    )

    await expect(api.get('/tables')).rejects.toThrow('Sessão encerrada.')
    expect(onUnauthorized).toHaveBeenCalledTimes(1)

    await expect(api.post('/auth/login', { email: 'a@a.com', password: '123' })).rejects.toThrow()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('retorna mensagem amigável quando há falha de rede', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(api.get('/shifts/active')).rejects.toThrow('Não foi possível conectar ao servidor.')
  })
})
