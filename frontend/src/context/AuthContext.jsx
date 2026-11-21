import { createContext, useContext, useEffect, useState } from 'react'
import { api, setUnauthorizedHandler, TOKEN_KEY } from '../services/api'

const USER_KEY = 'mesa-facil-user'

const AuthContext = createContext(null)

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY))
  } catch {
    return null
  }
}

function storeUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser)
  // Aviso exibido na tela de login (ex.: sessão encerrada pelo administrador).
  const [notice, setNotice] = useState('')

  function logout(message = '') {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setNotice(message)
    setUser(null)
  }

  useEffect(() => {
    setUnauthorizedHandler(() => logout('Sua sessão foi encerrada. Entre novamente.'))
    return () => setUnauthorizedHandler(null)
  }, [])

  // RN-16: nome e papel vêm do banco; ao abrir o app, atualiza o que ficou guardado no navegador.
  useEffect(() => {
    if (!user) return
    api
      .get('/me')
      .then(({ id, name, email, role }) => {
        const fresh = { id, name, email, role }
        storeUser(fresh)
        setUser(fresh)
      })
      .catch(() => {})
  }, [])

  async function login(email, password) {
    const session = await api.post('/auth/login', { email, password })
    localStorage.setItem(TOKEN_KEY, session.token)
    storeUser(session.user)
    setNotice('')
    setUser(session.user)
  }

  return (
    <AuthContext.Provider value={{ user, notice, login, logout }}>{children}</AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
