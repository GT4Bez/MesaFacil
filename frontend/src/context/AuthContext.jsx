import { createContext, useContext, useState } from 'react'
import { api, TOKEN_KEY } from '../services/api'

const USER_KEY = 'mesa-facil-user'

const AuthContext = createContext(null)

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY))
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser)

  async function login(email, password) {
    const session = await api.post('/auth/login', { email, password })
    localStorage.setItem(TOKEN_KEY, session.token)
    localStorage.setItem(USER_KEY, JSON.stringify(session.user))
    setUser(session.user)
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
