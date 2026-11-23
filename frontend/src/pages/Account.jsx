import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import { ROLE_LABELS } from '../utils/format'

// RN-16: dados do usuário logado e troca da própria senha (exige a atual).
export default function Account() {
  const { logout } = useAuth()
  const [account, setAccount] = useState(null)
  const [mismatch, setMismatch] = useState(false)
  const { busy, error, clearError, run } = useAction()

  useEffect(() => {
    run(async () => setAccount(await api.get('/me')))
  }, [])

  async function changePassword(event) {
    event.preventDefault()
    const fields = event.currentTarget.elements
    if (fields.newPassword.value !== fields.confirmPassword.value) {
      clearError()
      setMismatch(true)
      return
    }
    setMismatch(false)
    const changed = await run(() =>
      api.patch('/me/password', {
        currentPassword: fields.currentPassword.value,
        newPassword: fields.newPassword.value,
      }),
    )
    // A troca revoga o token atual: o usuário entra de novo com a senha nova.
    if (changed) logout('Senha alterada. Entre novamente com a nova senha.')
    else {
      // Com erro (senha atual errada ou 429 do limite de tentativas, RN-19), as senhas são descartadas.
      for (const name of ['currentPassword', 'newPassword', 'confirmPassword']) fields[name].value = ''
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONTA</span>
          <h1>Minha conta</h1>
          <p>Seus dados de acesso e troca de senha.</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="order-layout">
        <section className="panel">
          <div className="panel-heading">
            <h2>Dados</h2>
          </div>
          {account ? (
            <dl className="account-data">
              <dt>Nome</dt>
              <dd>{account.name}</dd>
              <dt>E-mail</dt>
              <dd>{account.email}</dd>
              <dt>Papel</dt>
              <dd>{ROLE_LABELS[account.role]}</dd>
              <dt>Cadastrado em</dt>
              <dd>{new Date(account.createdAt).toLocaleDateString('pt-BR')}</dd>
            </dl>
          ) : (
            !error && <div className="empty-state">Carregando...</div>
          )}
          <p className="hint">Para mudar nome, e-mail ou papel, fale com o administrador.</p>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Trocar senha</h2>
              <p>Depois da troca, você entra de novo com a senha nova.</p>
            </div>
          </div>
          <form className="payment-form" onSubmit={changePassword}>
            <label>
              Senha atual
              <input name="currentPassword" type="password" autoComplete="current-password" required />
            </label>
            <label>
              Nova senha
              <input name="newPassword" type="password" minLength={8} maxLength={72} autoComplete="new-password" required />
            </label>
            <label>
              Confirmar nova senha
              <input name="confirmPassword" type="password" minLength={8} maxLength={72} autoComplete="new-password" required />
            </label>
            {mismatch && <div className="alert error">A confirmação não confere com a nova senha.</div>}
            <div className="button-row">
              <button className="primary-btn" disabled={busy}>
                Trocar senha
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  )
}
