import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS } from '../utils/format'
import { menuFor } from '../utils/access'

export default function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">MF</span>
          <div>
            <b>Mesa Fácil</b>
            <small>Gestão de restaurante</small>
          </div>
        </div>

        <div className="side-label">MENU PRINCIPAL</div>
        {/* No celular (spec 012) vira barra inferior com ícone e rótulo curto. */}
        <nav aria-label="Menu principal">
          {menuFor(user.role).map((screen) => (
            <NavLink key={screen.path} to={screen.path} aria-label={screen.label}>
              <span className="nav-icon" aria-hidden="true">
                {screen.icon}
              </span>
              <span className="nav-label" aria-hidden="true">
                {screen.label}
              </span>
              <span className="nav-short" aria-hidden="true">
                {screen.short}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-chip">
            <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div>
              <b>{user.name}</b>
              <small>{ROLE_LABELS[user.role]}</small>
            </div>
          </div>
          <button className="logout" onClick={() => logout()}>
            ↪ Sair da conta
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="eyebrow">PAINEL DE CONTROLE</span>
            <b>Olá, {user.name}!</b>
          </div>
          <button className="topbar-logout" onClick={() => logout()}>
            Sair
          </button>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
        <footer>
          Mesa Fácil <span>•</span> Sistema de gestão de restaurante
        </footer>
      </main>
    </div>
  )
}
