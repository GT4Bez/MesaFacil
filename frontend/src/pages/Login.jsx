import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAction } from '../hooks/useAction'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { login } = useAuth()
  const { busy, error, run } = useAction()

  // Após o login, o roteador (App) redireciona para a tela inicial do papel.
  function handleSubmit(event) {
    event.preventDefault()
    run(() => login(email, password))
  }

  return (
    <div className="login-page">
      <section className="login-art">
        <div className="login-brand">
          <span className="brand-mark">MF</span>
          <b>Mesa Fácil</b>
        </div>
        <div className="art-copy">
          <span className="eyebrow light">GESTÃO INTELIGENTE</span>
          <h1>
            Seu restaurante,
            <br />
            mais organizado.
          </h1>
          <p>Atendimento, mesas e pagamentos em um só lugar.</p>
        </div>
        <div className="art-footer">Simplicidade que transforma o atendimento.</div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <span className="eyebrow">BEM-VINDO DE VOLTA</span>
          <h2>Acesse sua conta</h2>
          <p>Entre com seus dados para continuar.</p>

          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seuemail@exemplo.com"
            autoComplete="username"
          />

          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Digite sua senha"
            autoComplete="current-password"
          />

          {error && <div className="alert error">{error}</div>}

          <button className="primary-btn full" disabled={busy}>
            {busy ? 'Entrando...' : 'Entrar na plataforma'} <span>→</span>
          </button>
          <small className="login-note">Acesso restrito à equipe do restaurante.</small>
        </form>
      </section>
    </div>
  )
}
