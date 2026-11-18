import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { homeFor } from '../utils/access'

// Rota fora do papel volta para a home do papel (spec 004).
export default function RoleRoute({ roles }) {
  const { user } = useAuth()
  return roles.includes(user.role) ? <Outlet /> : <Navigate to={homeFor(user.role)} replace />
}
