import { createContext, useContext, useState } from 'react';
import { post } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mesa-facil-user') || 'null'); }
    catch { return null; }
  });

  async function login(email, password) {
    const result = await post('/auth/login', { email, password });
    const token = result.token || result.accessToken;
    const loggedUser = result.user || result;
    if (!token) throw new Error('O backend não retornou o token de autenticação.');
    localStorage.setItem('mesa-facil-token', token);
    localStorage.setItem('mesa-facil-user', JSON.stringify(loggedUser));
    setUser(loggedUser);
    return loggedUser;
  }

  function logout() {
    localStorage.removeItem('mesa-facil-token');
    localStorage.removeItem('mesa-facil-user');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!localStorage.getItem('mesa-facil-token') }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
