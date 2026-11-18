import './env.js'

const { default: app } = await import('../../src/app.js')

// Sobe a app numa porta livre e devolve um cliente HTTP que já envia o token informado.
export async function startServer() {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance))
  })
  const base = `http://127.0.0.1:${server.address().port}`

  async function api(method, path, { token, body, headers = {} } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    return { status: res.status, json, headers: res.headers }
  }

  return { base, api, close: () => new Promise((resolve) => server.close(resolve)) }
}
