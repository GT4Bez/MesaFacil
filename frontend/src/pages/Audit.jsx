import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import { AUDIT_CATEGORIES, describeAudit } from '../utils/auditLabels'
import { setDayRange } from '../utils/dates'
import { ROLE_LABELS } from '../utils/format'

const EMPTY_FILTERS = { category: null, userId: '', shiftId: '', from: '', to: '' }

const formatDateTime = (value) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function auditUrl(filters, before = null) {
  const params = new URLSearchParams()
  if (filters.category) params.set('category', filters.category)
  if (filters.userId) params.set('userId', filters.userId)
  if (filters.shiftId) params.set('shiftId', filters.shiftId)
  setDayRange(params, filters)
  if (before) params.set('before', before)
  const query = params.toString()
  return `/audit-logs${query ? `?${query}` : ''}`
}

// RN-20 (spec 017): trilha de auditoria, só leitura. As ações de usuários só aparecem para o admin.
export default function Audit() {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [actors, setActors] = useState([])
  const [page, setPage] = useState(null)
  const [loadError, setLoadError] = useState('')
  const { busy, error, run } = useAction()

  useEffect(() => {
    api.get('/audit-logs/actors').then((data) => setActors(data.actors), () => setActors([]))
  }, [])

  // Trocar um filtro recarrega do início; uma resposta atrasada de um filtro antigo é descartada.
  useEffect(() => {
    let current = true
    setPage(null)
    setLoadError('')
    api.get(auditUrl(filters)).then(
      (data) => current && setPage(data),
      (e) => current && setLoadError(e.message),
    )
    return () => {
      current = false
    }
  }, [filters])

  function loadMore() {
    run(async () => {
      const next = await api.get(auditUrl(filters, page.nextBefore))
      setPage({ entries: [...page.entries, ...next.entries], nextBefore: next.nextBefore })
    })
  }

  const setFilter = (field) => (event) => setFilters({ ...filters, [field]: event.target.value })
  const categories = AUDIT_CATEGORIES.filter((category) => isAdmin || !category.adminOnly)
  const hasFilters = Object.entries(filters).some(([key, value]) => value !== EMPTY_FILTERS[key])

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO</span>
          <h1>Auditoria</h1>
          <p>Quem cancelou, autorizou, mudou preço, ajustou estoque ou foi bloqueado, do mais recente para o mais antigo.</p>
        </div>
      </div>

      <section className="panel audit-panel">
        <div className="category-row audit-categories" role="group" aria-label="Categoria">
          {categories.map(({ value, label }) => (
            <button
              key={label}
              type="button"
              className={value === filters.category ? 'category active' : 'category'}
              aria-pressed={value === filters.category}
              onClick={() => setFilters({ ...filters, category: value })}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="form-row filters-row audit-filters">
          <label>
            Quem fez
            <select value={filters.userId} onChange={setFilter('userId')}>
              <option value="">Todos</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name} · {ROLE_LABELS[actor.role] ?? actor.role}
                  {actor.active ? '' : ' (inativo)'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Turno
            <input
              type="text"
              inputMode="numeric"
              placeholder="Nº do turno"
              value={filters.shiftId}
              onChange={(event) => setFilters({ ...filters, shiftId: event.target.value.replace(/\D/g, '') })}
            />
          </label>
          <label>
            De
            <input type="date" value={filters.from} max={filters.to || undefined} onChange={setFilter('from')} />
          </label>
          <label>
            Até
            <input type="date" value={filters.to} min={filters.from || undefined} onChange={setFilter('to')} />
          </label>
          {hasFilters && (
            <button type="button" className="outline-btn audit-clear" onClick={() => setFilters(EMPTY_FILTERS)}>
              Limpar filtros
            </button>
          )}
        </div>

        {(loadError || error) && <div className="alert error">{loadError || error}</div>}
        {!page && !loadError && <div className="empty-state">Carregando...</div>}
        {page?.entries.length === 0 && <div className="empty-state">Nenhum registro para esses filtros.</div>}
        {page?.entries.length > 0 && (
          <ul className="audit-list">
            {page.entries.map((entry) => {
              const { title, summary } = describeAudit(entry)
              return (
                <li key={entry.id} className="audit-entry">
                  <div className="audit-when">
                    <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                    <small>
                      {entry.user.name} · {ROLE_LABELS[entry.user.role] ?? entry.user.role}
                    </small>
                  </div>
                  <div className="audit-what">
                    <b>{title}</b>
                    {summary && <span>{summary}</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {page?.nextBefore && (
          <div className="history-more">
            <button type="button" className="outline-btn" disabled={busy} onClick={loadMore}>
              {busy ? 'Carregando...' : 'Carregar mais'}
            </button>
          </div>
        )}
      </section>
    </>
  )
}
