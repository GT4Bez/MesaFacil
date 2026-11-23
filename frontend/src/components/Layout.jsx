import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS } from '../utils/format'
import { menuFor } from '../utils/access'
import Modal from './Modal'

// Celular: a barra inferior tem no máximo 5 posições. Com mais telas, as 4 primeiras ficam na
// barra e o resto vai para "Mais", que abre a lista num painel. No desktop a lista é completa.
export const MOBILE_SLOTS = 5

export const overflowOf = (screens) => (screens.length > MOBILE_SLOTS ? screens.slice(MOBILE_SLOTS - 1) : [])

export default function Layout() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const screens = menuFor(user.role)
  const overflow = overflowOf(screens)
  const overflowPaths = new Set(overflow.map((screen) => screen.path))
  const moreActive = overflow.some((screen) => pathname.startsWith(screen.path))

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
          {screens.map((screen) => (
            <NavLink
              key={screen.path}
              to={screen.path}
              aria-label={screen.label}
              className={overflowPaths.has(screen.path) ? 'nav-overflow' : undefined}
            >
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
          {overflow.length > 0 && (
            <button
              type="button"
              className={`nav-more${moreActive ? ' active' : ''}`}
              aria-label="Mais telas"
              aria-haspopup="dialog"
              onClick={() => setMoreOpen(true)}
            >
              <span className="nav-icon" aria-hidden="true">
                ⋯
              </span>
              <span className="nav-short" aria-hidden="true">
                Mais
              </span>
            </button>
          )}
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

      {moreOpen && (
        <Modal title="Mais telas" onClose={() => setMoreOpen(false)}>
          <div className="more-menu">
            {overflow.map((screen) => (
              <NavLink key={screen.path} to={screen.path} onClick={() => setMoreOpen(false)}>
                <span className="nav-icon" aria-hidden="true">
                  {screen.icon}
                </span>
                {screen.label}
              </NavLink>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
