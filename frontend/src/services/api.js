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
    throw new Error(OFFLINE_MESSAGE)
  }
  if (response.status === 401 && token && path !== '/auth/login') onUnauthorized?.()
  return response
}

// Spec 021: quando a resposta não traz o envelope (ex.: o túnel devolve 502 em HTML), a mensagem
// explica o que provavelmente aconteceu em vez de só mostrar o número.
export const OFFLINE_MESSAGE = 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
const UNAVAILABLE = 'O servidor está indisponível no momento (reiniciando ou fora do ar). Tente de novo em alguns segundos.'
const STATUS_MESSAGES = {
  401: 'Sua sessão expirou. Faça login novamente.',
  403: 'Seu usuário não tem permissão para esta ação.',
  404: 'Não encontrado: o endereço ou o registro não existe mais. Atualize a tela.',
  413: 'Os dados enviados são grandes demais para o servidor.',
  429: 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.',
  500: 'Erro inesperado no servidor. Tente de novo; se continuar, avise o suporte.',
  502: UNAVAILABLE,
  503: UNAVAILABLE,
  504: 'O servidor demorou demais para responder. Tente de novo em alguns segundos.',
}
export const statusMessage = (status) =>
  STATUS_MESSAGES[status] ?? `O servidor respondeu com erro ${status} e não explicou o motivo. Tente de novo.`

// Os erros da API vêm no envelope { success: false, error }.
async function failure(response) {
  const payload = await response.json().catch(() => null)
  return new Error(payload?.error || statusMessage(response.status))
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
