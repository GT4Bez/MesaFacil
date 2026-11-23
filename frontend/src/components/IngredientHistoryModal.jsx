import { useEffect, useState } from 'react'
import Modal from './Modal'
import { useAction } from '../hooks/useAction'
import { api, saveFile } from '../services/api'
import { setDayRange } from '../utils/dates'
import { formatMoney, formatQuantity, UNIT_LABELS } from '../utils/format'

const TYPES = [
  { type: null, label: 'Todos' },
  { type: 'purchase', label: 'Entradas' },
  { type: 'adjustment', label: 'Ajustes' },
  { type: 'sale', label: 'Vendas' },
]
const TYPE_LABELS = { purchase: 'Entrada', adjustment: 'Ajuste', sale: 'Venda' }
const EMPTY_FILTERS = { type: null, from: '', to: '', shiftOnly: false }

// Origem do movimento: a venda que deu baixa, o motivo do ajuste ou o custo da entrada.
function origin(movement, unit) {
  if (movement.sale) {
    const { orderId, tableNumber, itemQuantity, menuItem } = movement.sale
    return `Pedido ${orderId} · Mesa ${tableNumber} · ${itemQuantity}× ${menuItem}`
  }
  if (movement.reason) return movement.reason
  return movement.type === 'purchase' ? `Custo ${formatMoney(movement.unitCost)}/${UNIT_LABELS[unit] ?? unit}` : '—'
}

const formatDateTime = (value) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const signed = (value, unit) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatQuantity(Math.abs(value), unit)}`

// Spec 018: "3 movimentos · entradas +5 kg · saídas −0,45 kg · líquido +4,55 kg".
export function summaryText(summary, unit) {
  return [
    `${summary.count} ${summary.count === 1 ? 'movimento' : 'movimentos'}`,
    `entradas ${signed(summary.in, unit)}`,
    `saídas ${signed(summary.out, unit)}`,
    `líquido ${signed(summary.net, unit)}`,
  ].join(' · ')
}

// Specs 016 e 018: a query dos filtros, igual na lista e no CSV (que ignora `before`).
export function movementsQuery(filters, { shiftId = null, before = null } = {}) {
  const params = new URLSearchParams()
  if (filters.type) params.set('type', filters.type)
  setDayRange(params, filters)
  if (filters.shiftOnly && shiftId) params.set('shiftId', shiftId)
  if (before) params.set('before', before)
  const query = params.toString()
  return query ? `?${query}` : ''
}

// Specs 016 e 018: de onde veio o saldo do insumo, com filtro por tipo, período e turno, resumo do recorte
// e exportação CSV. O saldo depois de cada movimento vem da API e considera todos os tipos, mesmo com filtro.
export default function IngredientHistoryModal({ ingredient, onClose }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [activeShift, setActiveShift] = useState(null)
  const [history, setHistory] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const { busy, error, run } = useAction()

  useEffect(() => {
    api.get('/shifts/active').then(setActiveShift, () => setActiveShift(null))
  }, [])

  const shiftId = activeShift?.id ?? null
  // Só o turno filtra a query: a chegada do turno ativo não recarrega a lista sem o filtro ligado.
  const queryShift = filters.shiftOnly ? shiftId : null
  const base = `/ingredients/${ingredient.id}/movements`

  // Trocar um filtro recarrega do início; uma resposta atrasada de um filtro antigo é descartada.
  useEffect(() => {
    let current = true
    setHistory(null)
    setLoadError('')
    api.get(`${base}${movementsQuery(filters, { shiftId: queryShift })}`).then(
      (data) => current && setHistory(data),
      (e) => current && setLoadError(e.message),
    )
    return () => {
      current = false
    }
  }, [base, filters, queryShift])

  function loadMore() {
    run(async () => {
      const page = await api.get(`${base}${movementsQuery(filters, { shiftId: queryShift, before: history.nextBefore })}`)
      setHistory({ ...page, movements: [...history.movements, ...page.movements] })
    })
  }

  async function exportCsv() {
    setExporting(true)
    setExportError('')
    try {
      saveFile(await api.download(`${base}.csv${movementsQuery(filters, { shiftId: queryShift })}`))
    } catch (e) {
      setExportError(e.message)
    } finally {
      setExporting(false)
    }
  }

  const setFilter = (patch) => setFilters({ ...filters, ...patch })
  const hasFilters = Object.entries(filters).some(([key, value]) => value !== EMPTY_FILTERS[key])
  const current = history?.ingredient ?? ingredient
  const unit = current.unit
  const listError = loadError || error

  return (
    <Modal title={`Histórico · ${current.name}`} wide onClose={onClose}>
      <div className="history-summary">
        <span className="muted">Saldo atual</span>
        <strong>{formatQuantity(current.stockQuantity, unit)}</strong>
      </div>
      {history && !history.consistent && (
        <div className="alert warning">O saldo atual não bate com a soma dos movimentos.</div>
      )}
      <div className="category-row history-filters" role="group" aria-label="Filtrar movimentos">
        {TYPES.map(({ type, label }) => (
          <button
            key={label}
            type="button"
            className={type === filters.type ? 'category active' : 'category'}
            aria-pressed={type === filters.type}
            onClick={() => setFilter({ type })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="form-row filters-row history-period">
        <label>
          De
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => setFilter({ from: event.target.value })}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => setFilter({ to: event.target.value })}
          />
        </label>
        <div className="history-shift">
          <button
            type="button"
            className={filters.shiftOnly ? 'category active' : 'category'}
            aria-pressed={filters.shiftOnly}
            aria-describedby={shiftId ? undefined : 'history-no-shift'}
            disabled={!shiftId}
            onClick={() => setFilter({ shiftOnly: !filters.shiftOnly })}
          >
            Só o turno atual
          </button>
          {!shiftId && (
            <small id="history-no-shift" className="muted">
              Nenhum turno aberto
            </small>
          )}
        </div>
        {hasFilters && (
          <button type="button" className="outline-btn history-clear" onClick={() => setFilters(EMPTY_FILTERS)}>
            Limpar filtros
          </button>
        )}
      </div>
      {history?.summary && (
        <p className="history-range" role="status">
          {summaryText(history.summary, unit)}
        </p>
      )}
      {listError && <div className="alert error">{listError}</div>}
      {!history && !listError && <div className="empty-state">Carregando...</div>}
      {history?.movements.length === 0 && (
        <div className="empty-state">{hasFilters ? 'Nenhum movimento nesse recorte.' : 'Nenhum movimento registrado.'}</div>
      )}
      {history?.movements.length > 0 && (
        <table className="report-table history-table">
          <thead>
            <tr>
              <th>Movimento</th>
              <th>Quantidade</th>
              <th>Saldo depois</th>
              <th>Origem</th>
            </tr>
          </thead>
          <tbody>
            {history.movements.map((movement) => (
              <tr key={movement.id}>
                <td>
                  <b>{TYPE_LABELS[movement.type]}</b>
                  <small>{formatDateTime(movement.createdAt)}</small>
                </td>
                <td className={movement.quantity > 0 ? 'qty-in' : 'qty-out'}>
                  {movement.quantity > 0 ? '+' : '−'}
                  {formatQuantity(Math.abs(movement.quantity), unit)}
                </td>
                <td className="history-balance">{formatQuantity(movement.balanceAfter, unit)}</td>
                <td className="history-detail">
                  {origin(movement, unit)}
                  <small>por {movement.by}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {exportError && <div className="alert error">{exportError}</div>}
      <div className="history-more">
        {history?.nextBefore && (
          <button type="button" className="outline-btn" disabled={busy} onClick={loadMore}>
            {busy ? 'Carregando...' : 'Carregar mais'}
          </button>
        )}
        <button type="button" className="outline-btn history-export" disabled={exporting} onClick={exportCsv}>
          {exporting ? 'Exportando...' : 'Exportar CSV'}
        </button>
      </div>
    </Modal>
  )
}
