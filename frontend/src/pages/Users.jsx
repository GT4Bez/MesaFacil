import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import { ROLE_LABELS } from '../utils/format'

const EMPTY_FORM = { id: null, name: '', email: '', role: 'waiter', password: '' }
const ROLE_OPTIONS = Object.entries(ROLE_LABELS)

// RN-16: administração de usuários, só para o admin. Usuário nunca é apagado: é desativado.
export default function Users() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState(null)
  const [filters, setFilters] = useState({ role: '', active: 'true' })
  const [form, setForm] = useState(EMPTY_FORM)
  const [resetTarget, setResetTarget] = useState(null)
  const { busy, error, clearError, run } = useAction()

  async function load(current = filters) {
    const params = new URLSearchParams()
    if (current.role) params.set('role', current.role)
    if (current.active) params.set('active', current.active)
    const query = params.toString()
    setUsers(await api.get(`/users${query ? `?${query}` : ''}`))
  }

  useEffect(() => {
    run(() => load())
  }, [])

  const setFilter = (field) => (event) => {
    const next = { ...filters, [field]: event.target.value }
    setFilters(next)
    run(() => load(next))
  }

  const editing = form.id !== null
  const setField = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  async function save(event) {
    event.preventDefault()
    const { id, name, email, role, password } = form
    const saved = await run(async () => {
      if (editing) await api.patch(`/users/${id}`, { name, email, role })
      else await api.post('/users', { name, email, role, password })
      await load()
    })
    if (saved) setForm(EMPTY_FORM)
  }

  const toggleActive = (user) =>
    run(async () => {
      await api.patch(`/users/${user.id}`, { active: !user.active })
      await load()
    })

  const startEdit = (user) => {
    clearError()
    setForm({ id: user.id, name: user.name, email: user.email, role: user.role, password: '' })
  }

  const openReset = (user) => {
    clearError()
    setResetTarget(user)
  }
  const closeReset = () => {
    clearError()
    setResetTarget(null)
  }
  const resetPassword = (password) => run(() => api.put(`/users/${resetTarget.id}/password`, { password }))

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO</span>
          <h1>Usuários</h1>
          <p>Cadastre a equipe, ajuste papéis e desative quem saiu. Desativar encerra a sessão na hora.</p>
        </div>
      </div>

      {error && !resetTarget && <div className="alert error">{error}</div>}

      <div className="order-layout">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Equipe</h2>
              <p>{users ? `${users.length} usuário(s)` : 'Carregando...'}</p>
            </div>
          </div>

          <div className="form-row filters-row">
            <label>
              Papel
              <select value={filters.role} onChange={setFilter('role')}>
                <option value="">Todos</option>
                {ROLE_OPTIONS.map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Situação
              <select value={filters.active} onChange={setFilter('active')}>
                <option value="true">Ativos</option>
                <option value="false">Inativos</option>
                <option value="">Todos</option>
              </select>
            </label>
          </div>

          <div className="user-list">
            {users?.map((user) => (
              <div className={`user-row ${user.active ? '' : 'inactive'}`} key={user.id}>
                <div>
                  <b>
                    {user.name}
                    {user.id === me.id && ' (você)'}
                  </b>
                  <small>{user.email}</small>
                  <span className="role-badge">{ROLE_LABELS[user.role]}</span>
                  {!user.active && <span className="role-badge off">Inativo</span>}
                </div>
                <div className="item-controls">
                  <button className="outline-btn" disabled={busy} onClick={() => startEdit(user)}>
                    Editar
                  </button>
                  <button className="outline-btn" disabled={busy} onClick={() => openReset(user)}>
                    Redefinir senha
                  </button>
                  {user.id !== me.id && (
                    <button className="outline-btn" disabled={busy} onClick={() => toggleActive(user)}>
                      {user.active ? 'Desativar' : 'Reativar'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {users?.length === 0 && <div className="empty-state">Nenhum usuário com esses filtros.</div>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{editing ? `Editar: ${form.name}` : 'Novo usuário'}</h2>
              <p>{editing ? 'A senha é redefinida pela ação da lista.' : 'Senha inicial de 8 a 72 caracteres.'}</p>
            </div>
          </div>

          <form className="payment-form" onSubmit={save}>
            <label>
              Nome
              <input value={form.name} onChange={setField('name')} maxLength={100} required />
            </label>
            <label>
              E-mail
              <input type="email" value={form.email} onChange={setField('email')} maxLength={255} required />
            </label>
            <label>
              Papel
              <select value={form.role} onChange={setField('role')}>
                {ROLE_OPTIONS.map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {!editing && (
              <label>
                Senha inicial
                <input
                  type="password"
                  value={form.password}
                  onChange={setField('password')}
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  required
                />
              </label>
            )}
            <div className="button-row">
              {editing && (
                <button type="button" className="outline-btn" onClick={() => setForm(EMPTY_FORM)}>
                  Cancelar edição
                </button>
              )}
              <button className="primary-btn" disabled={busy}>
                {editing ? 'Salvar alterações' : 'Cadastrar usuário'}
              </button>
            </div>
          </form>
        </section>
      </div>

      {resetTarget && (
        <PasswordModal
          user={resetTarget}
          busy={busy}
          error={error}
          onConfirm={resetPassword}
          onClose={closeReset}
        />
      )}
    </>
  )
}

// Redefinição de senha pelo admin: não pede a senha atual e encerra as sessões do usuário.
function PasswordModal({ user, busy, error, onConfirm, onClose }) {
  const dialogRef = useRef(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    dialogRef.current.showModal()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    if (await onConfirm(event.currentTarget.elements.password.value)) setDone(true)
  }

  function handleCancel(event) {
    if (busy) event.preventDefault()
    else onClose()
  }

  return (
    <dialog ref={dialogRef} className="modal" onCancel={handleCancel} aria-labelledby="password-modal-title">
      <form onSubmit={handleSubmit}>
        <h2 id="password-modal-title">Redefinir senha de {user.name}</h2>
        {done ? (
          <div className="alert success">Senha redefinida. As sessões abertas desse usuário foram encerradas.</div>
        ) : (
          <>
            <p>A nova senha vale no próximo login. As sessões abertas desse usuário serão encerradas.</p>
            {error && <div className="alert error">{error}</div>}
            <label>
              Nova senha
              <input
                name="password"
                type="password"
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                required
                autoFocus
              />
            </label>
          </>
        )}
        <div className="button-row">
          <button type="button" className="outline-btn" onClick={onClose} disabled={busy}>
            {done ? 'Fechar' : 'Voltar'}
          </button>
          {!done && (
            <button className="primary-btn" disabled={busy}>
              Redefinir senha
            </button>
          )}
        </div>
      </form>
    </dialog>
  )
}
