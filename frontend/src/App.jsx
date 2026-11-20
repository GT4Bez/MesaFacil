import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import RoleRoute from './components/RoleRoute'
import Login from './pages/Login'
import Tables from './pages/Tables'
import Order from './pages/Order'
import Cashier from './pages/Cashier'
import Kitchen from './pages/Kitchen'
import MenuAdmin from './pages/MenuAdmin'
import ShiftAdmin from './pages/ShiftAdmin'
import Users from './pages/Users'
import Account from './pages/Account'
import { homeFor, SCREENS } from './utils/access'

export default function App() {
  const { user } = useAuth()
  const home = homeFor(user?.role)

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={home} replace /> : <Login />} />
      <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
        <Route element={<RoleRoute roles={SCREENS.tables.roles} />}>
          <Route path={SCREENS.tables.path} element={<Tables />} />
          <Route path="/orders/:id" element={<Order />} />
        </Route>
        <Route element={<RoleRoute roles={SCREENS.kitchen.roles} />}>
          <Route path={SCREENS.kitchen.path} element={<Kitchen />} />
        </Route>
        <Route element={<RoleRoute roles={SCREENS.cashier.roles} />}>
          <Route path={SCREENS.cashier.path} element={<Cashier />} />
        </Route>
        <Route element={<RoleRoute roles={SCREENS.menuAdmin.roles} />}>
          <Route path={SCREENS.menuAdmin.path} element={<MenuAdmin />} />
        </Route>
        <Route element={<RoleRoute roles={SCREENS.shiftAdmin.roles} />}>
          <Route path={SCREENS.shiftAdmin.path} element={<ShiftAdmin />} />
        </Route>
        <Route element={<RoleRoute roles={SCREENS.users.roles} />}>
          <Route path={SCREENS.users.path} element={<Users />} />
        </Route>
        <Route element={<RoleRoute roles={SCREENS.account.roles} />}>
          <Route path={SCREENS.account.path} element={<Account />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  )
}
