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
    await expect(api.get('/shifts/active')).rejects.toThrow(
      'Sem conexão com o servidor. Verifique a internet e tente de novo.',
    )
  })

  // Spec 021: resposta sem o envelope (ex.: o túnel devolve HTML) ganha mensagem pelo status.
  it.each([
    [502, 'O servidor está indisponível no momento (reiniciando ou fora do ar). Tente de novo em alguns segundos.'],
    [504, 'O servidor demorou demais para responder. Tente de novo em alguns segundos.'],
    [413, 'Os dados enviados são grandes demais para o servidor.'],
    [418, 'O servidor respondeu com erro 418 e não explicou o motivo. Tente de novo.'],
  ])('status %i sem envelope → mensagem informativa', async (status, message) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Bad gateway</html>', { status }))
    await expect(api.get('/tables')).rejects.toThrow(message)
  })

  it('com envelope, a mensagem da API tem prioridade', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ success: false, error: 'Ainda faltam R$ 10,00 para quitar o pedido.' }, 409),
    )
    await expect(api.get('/tables')).rejects.toThrow('Ainda faltam R$ 10,00 para quitar o pedido.')
  })

  it('download sem envelope também usa a mensagem por status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
    await expect(api.download('/x.csv')).rejects.toThrow(/indisponível no momento/)
  })
})
