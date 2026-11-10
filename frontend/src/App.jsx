import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Tables from './pages/Tables'
import Order from './pages/Order'
import Cashier from './pages/Cashier'

export default function App() {
  const { user } = useAuth()
  const home = user?.role === 'cashier' ? '/cashier' : '/tables'

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={home} replace /> : <Login />} />
      <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
        <Route path="/tables" element={<Tables />} />
        <Route path="/orders/:id" element={<Order />} />
        <Route path="/cashier" element={<Cashier />} />
      </Route>
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  )
}
