const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export const TOKEN_KEY = 'mesa-facil-token'

// RN-16: o backend responde 401 quando o token foi revogado (usuário desativado, senha trocada).
// O AuthContext registra aqui o que fazer nesse caso (encerrar a sessão local).
let onUnauthorized = null
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler
}

async function send(method, path, body) {
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
  if (response.status === 401 && token && path !== '/auth/login') onUnauthorized?.()
  return response
}

// Os erros vêm sempre no envelope { success: false, error }.
async function failure(response) {
  const payload = await response.json().catch(() => null)
  return new Error(payload?.error || `Erro ${response.status}. Tente novamente.`)
}

// A API responde sempre no envelope { success, data } ou { success, error }.
async function request(method, path, body) {
  const response = await send(method, path, body)
  if (!response.ok) throw await failure(response)
  const payload = await response.json().catch(() => null)
  return payload?.data
}

// Spec 018: arquivo (ex.: CSV) com o token; o nome vem do Content-Disposition.
async function download(path) {
  const response = await send('GET', path)
  if (!response.ok) throw await failure(response)
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? path.split('?')[0].split('/').pop()
  return { blob: await response.blob(), filename }
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  put: (path, body) => request('PUT', path, body),
  download,
}

// Entrega ao navegador um arquivo baixado com `api.download`.
export function saveFile({ blob, filename }) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
