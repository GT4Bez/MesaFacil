import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { hasRole, homeFor } from '../utils/access'

// Rota fora do papel volta para a home do papel (spec 004); o admin acessa todas (RN-16).
export default function RoleRoute({ roles }) {
  const { user } = useAuth()
  return hasRole(user, ...roles) ? <Outlet /> : <Navigate to={homeFor(user.role)} replace />
}
