const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export const TOKEN_KEY = 'mesa-facil-token'

// RN-16: o backend responde 401 quando o token foi revogado (usuário desativado, senha trocada).
// O AuthContext registra aqui o que fazer nesse caso (encerrar a sessão local).
let onUnauthorized = null
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler
}

// A API responde sempre no envelope { success, data } ou { success, error }.
async function request(method, path, body) {
  const token = localStorage.getItem(TOKEN_KEY)

  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body && JSON.stringify(body),
    })
  } catch {
    throw new Error('Não foi possível conectar ao servidor.')
  }

  const payload = await response.json().catch(() => null)
  if (response.status === 401 && token && path !== '/auth/login') onUnauthorized?.()
  if (!response.ok) {
    throw new Error(payload?.error || `Erro ${response.status}. Tente novamente.`)
  }
  return payload?.data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  put: (path, body) => request('PUT', path, body),
}
