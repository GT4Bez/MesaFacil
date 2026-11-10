import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault(); setError('');
    if (!email.trim() || !password) { setError('Preencha o e-mail e a senha para continuar.'); return; }
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      const role = String(user.role || user.papel || '').toLowerCase();
      navigate(role.includes('caixa') || role.includes('cashier') ? '/cashier' : '/tables');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return <div className="login-page"><section className="login-art"><div className="login-brand"><span className="brand-mark">MF</span><b>Mesa Fácil</b></div><div className="art-copy"><span className="eyebrow light">GESTÃO INTELIGENTE</span><h1>Seu restaurante,<br/>mais organizado.</h1><p>Atendimento, mesas e pagamentos em um só lugar.</p></div><div className="art-footer">Simplicidade que transforma o atendimento.</div></section>
    <section className="login-panel"><form className="login-card" onSubmit={handleSubmit}><span className="eyebrow">BEM-VINDO DE VOLTA</span><h2>Acesse sua conta</h2><p>Entre com seus dados para continuar.</p>
      <label>E-mail</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seuemail@exemplo.com" autoComplete="username"/>
      <label>Senha</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Digite sua senha" autoComplete="current-password"/>
      {error && <div className="alert error">{error}</div>}
      <button className="primary-btn full" disabled={loading}>{loading ? 'Entrando...' : 'Entrar na plataforma'} <span>→</span></button>
      <small className="login-note">Acesso restrito à equipe do restaurante.</small>
    </form></section></div>;
}
