import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = String(user?.role || user?.papel || '').toLowerCase();
  const isManager = role.includes('gerente') || role.includes('manager') || role.includes('admin');
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">MF</span><div><b>Mesa Fácil</b><small>Gestão de restaurante</small></div></div>
      <div className="side-label">MENU PRINCIPAL</div>
      <nav>
        <NavLink to="/tables">▦ <span>Salão e mesas</span></NavLink>
        <NavLink to="/cashier">▤ <span>Caixa</span></NavLink>
      </nav>
      <div className="sidebar-bottom"><div className="user-chip"><div className="avatar">{(user?.name || user?.nome || 'U').charAt(0).toUpperCase()}</div><div><b>{user?.name || user?.nome || 'Usuário'}</b><small>{user?.role || user?.papel || 'Operador'}</small></div></div><button className="logout" onClick={() => { logout(); navigate('/login'); }}>↪ Sair da conta</button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><span className="eyebrow">PAINEL DE CONTROLE</span><b>Olá, {user?.name || user?.nome || 'equipe'}!</b></div><span className="status-pill"><i /> Sistema conectado</span></header>
      <div className="page-content"><Outlet context={{ isManager }} /></div>
      <footer>Mesa Fácil <span>•</span> Sistema de gestão de restaurante</footer>
    </main>
  </div>;
}
