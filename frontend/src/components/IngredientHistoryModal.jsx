import { useEffect, useState } from 'react'
import Modal from './Modal'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import { formatMoney, formatQuantity, UNIT_LABELS } from '../utils/format'

const FILTERS = [
  { type: null, label: 'Todos' },
  { type: 'purchase', label: 'Entradas' },
  { type: 'adjustment', label: 'Ajustes' },
  { type: 'sale', label: 'Vendas' },
]
const TYPE_LABELS = { purchase: 'Entrada', adjustment: 'Ajuste', sale: 'Venda' }

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

const movementsUrl = (id, { type, before }) => {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  if (before) params.set('before', before)
  const query = params.toString()
  return `/ingredients/${id}/movements${query ? `?${query}` : ''}`
}

// Spec 016: de onde veio o saldo do insumo. O saldo depois de cada movimento vem calculado da API
// e considera todos os tipos, mesmo com o filtro.
export default function IngredientHistoryModal({ ingredient, onClose }) {
  const [filter, setFilter] = useState(null)
  const [history, setHistory] = useState(null)
  const { busy, error, run } = useAction()

  useEffect(() => {
    setHistory(null)
    run(async () => setHistory(await api.get(movementsUrl(ingredient.id, { type: filter }))))
  }, [ingredient.id, filter])

  function loadMore() {
    run(async () => {
      const page = await api.get(movementsUrl(ingredient.id, { type: filter, before: history.nextBefore }))
      setHistory({ ...page, movements: [...history.movements, ...page.movements] })
    })
  }

  const current = history?.ingredient ?? ingredient
  const unit = current.unit

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
        {FILTERS.map(({ type, label }) => (
          <button
            key={label}
            type="button"
            className={type === filter ? 'category active' : 'category'}
            aria-pressed={type === filter}
            onClick={() => setFilter(type)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <div className="alert error">{error}</div>}
      {!history && !error && <div className="empty-state">Carregando...</div>}
      {history?.movements.length === 0 && <div className="empty-state">Nenhum movimento registrado.</div>}
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
      {history?.nextBefore && (
        <div className="history-more">
          <button type="button" className="outline-btn" disabled={busy} onClick={loadMore}>
            {busy ? 'Carregando...' : 'Carregar mais'}
          </button>
        </div>
      )}
    </Modal>
  )
}
