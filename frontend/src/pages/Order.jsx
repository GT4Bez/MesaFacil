import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAction } from '../hooks/useAction'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import QuantityStepper from '../components/QuantityStepper'
import ReasonModal from '../components/ReasonModal'
import Toast from '../components/Toast'
import { hasRole } from '../utils/access'
import { api } from '../services/api'
import { formatMoney, ITEM_STATUS_LABELS, ORDER_STATUS_LABELS } from '../utils/format'

const ALL_CATEGORIES = 'Todos'
const ACTIVE_ORDER_STATUSES = ['open', 'in_kitchen', 'ready_to_pay']

export default function Order() {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [menu, setMenu] = useState([])
  // null, { kind: 'order' } ou { kind: 'item', item }: o que o gerente está cancelando.
  const [cancelTarget, setCancelTarget] = useState(null)
  // Item do cardápio sendo adicionado (modal de quantidade e observação, spec 012).
  const [addTarget, setAddTarget] = useState(null)
  const [toast, setToast] = useState('')
  const { busy, error, clearError, run } = useAction()
  const { user } = useAuth()
  const isManager = hasRole(user, 'manager')

  function openCancel(target) {
    clearError()
    setCancelTarget(target)
  }

  function closeCancel() {
    clearError()
    setCancelTarget(null)
  }

  async function loadOrder() {
    setOrder(await api.get(`/orders/${id}`))
  }

  useEffect(() => {
    run(() => Promise.all([loadOrder(), api.get('/menu-items').then(setMenu)]))
  }, [id])

  const change = (request) =>
    run(async () => {
      await request()
      await loadOrder()
    })

  function openAdd(menuItem) {
    clearError()
    setAddTarget(menuItem)
  }

  function closeAdd() {
    clearError()
    setAddTarget(null)
  }

  async function addItem({ quantity, notes }) {
    const added = await change(() =>
      api.post(`/orders/${id}/items`, { menuItemId: addTarget.id, quantity, notes }),
    )
    if (added) {
      setToast(`${quantity}× ${addTarget.name} adicionado à comanda`)
      setAddTarget(null)
    }
  }
  const setQuantity = (item, quantity) =>
    change(() => api.patch(`/order-items/${item.id}/quantity`, { quantity }))
  const removeItem = (item) =>
    change(() => api.patch(`/order-items/${item.id}/status`, { status: 'canceled' }))
  const setStatus = (status) => change(() => api.patch(`/orders/${id}/status`, { status }))
  // RN-05 (item enviado) e RN-11 (pedido): só o gerente, com motivo.
  const confirmCancel = (reason) =>
    cancelTarget.kind === 'order'
      ? change(() => api.patch(`/orders/${id}/status`, { status: 'canceled', reason }))
      : change(() =>
          api.patch(`/order-items/${cancelTarget.item.id}/status`, { status: 'canceled', reason }),
        )

  if (!order) {
    return error ? (
      <div className="alert error">{error}</div>
    ) : (
      <div className="empty-state">Carregando comanda...</div>
    )
  }

  const activeItems = order.items.filter((item) => item.status !== 'canceled')
  const subtotal = activeItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const hasPendingItems = activeItems.some((item) => item.status === 'pending')
  // RN-06: a conta só pode ser pedida quando a cozinha terminou todos os itens.
  const kitchenDone =
    order.status === 'in_kitchen' && activeItems.every((item) => item.status === 'ready')
  const orderActive = ACTIVE_ORDER_STATUSES.includes(order.status)
  const billHint = nextStepHint(order.status, activeItems)

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ATENDIMENTO</span>
          <h1>Comanda da mesa {order.table.number}</h1>
          <p>
            Pedido #{order.id} · Aberto em {new Date(order.createdAt).toLocaleString('pt-BR')} ·
            Status: {ORDER_STATUS_LABELS[order.status]}
          </p>
        </div>
        <div className="button-row">
          {isManager && orderActive && (
            <button
              className="outline-btn"
              disabled={busy}
              onClick={() => openCancel({ kind: 'order' })}
            >
              Cancelar pedido
            </button>
          )}
          <Link className="outline-btn" to="/tables">
            ← Voltar às mesas
          </Link>
        </div>
      </div>

      {order.cancellation && (
        <div className="alert warning">
          Pedido cancelado por {order.cancellation.canceledBy.name}. Motivo:{' '}
          {order.cancellation.reason}
        </div>
      )}
      {error && !cancelTarget && !addTarget && <div className="alert error">{error}</div>}

      <div className="order-layout">
        <Menu menu={menu} onPick={openAdd} />

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Itens da comanda</h2>
              <p>{order.items.length} item(ns) lançado(s)</p>
            </div>
          </div>

          <div className="order-items">
            {order.items.map((item) => (
              <OrderItem
                key={item.id}
                item={item}
                busy={busy}
                onQuantityChange={(quantity) => setQuantity(item, quantity)}
                onRemove={() => removeItem(item)}
                onCancel={
                  isManager && orderActive ? () => openCancel({ kind: 'item', item }) : null
                }
              />
            ))}
            {!order.items.length && (
              <div className="empty-state">Nenhum item adicionado ainda.</div>
            )}
          </div>

          <div className="subtotal-row">
            <span>Subtotal</span>
            <strong>{formatMoney(subtotal)}</strong>
          </div>
          <div className="stack-buttons">
            <button
              className="primary-btn full"
              disabled={busy || !hasPendingItems}
              onClick={() => setStatus('in_kitchen')}
            >
              Enviar para a cozinha →
            </button>
            <button
              className="outline-btn full"
              disabled={busy || !kitchenDone}
              onClick={() => setStatus('ready_to_pay')}
            >
              Pedir a conta
            </button>
          </div>
          {billHint && <small className="hint">{billHint}</small>}
        </section>
      </div>

      {addTarget && (
        <AddItemModal item={addTarget} busy={busy} error={error} onConfirm={addItem} onClose={closeAdd} />
      )}
      <Toast message={toast} onDone={() => setToast('')} />

      {cancelTarget && (
        <ReasonModal
          title={
            cancelTarget.kind === 'order'
              ? `Cancelar o pedido #${order.id}`
              : `Cancelar ${cancelTarget.item.name}`
          }
          description={
            cancelTarget.kind === 'order'
              ? 'Todos os itens ainda ativos serão cancelados e a mesa será liberada. Pedido com pagamento registrado não pode ser cancelado.'
              : 'O item já foi enviado à cozinha. O cancelamento fica registrado com o seu nome.'
          }
          confirmLabel={cancelTarget.kind === 'order' ? 'Cancelar pedido' : 'Cancelar item'}
          busy={busy}
          error={error}
          onConfirm={confirmCancel}
          onClose={closeCancel}
        />
      )}
    </>
  )
}

// Diz o que falta para a conta ser pedida (RN-06) ou onde ela segue (RN-03), antes do clique.
function nextStepHint(status, activeItems) {
  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`
  const pending = activeItems.filter((item) => item.status === 'pending').length
  const inKitchen = activeItems.filter((item) => ['sent', 'preparing'].includes(item.status)).length
  if (status === 'ready_to_pay') return 'Conta pedida: o pagamento e o encerramento são feitos no caixa.'
  if (!ACTIVE_ORDER_STATUSES.includes(status)) return null
  if (!activeItems.length) return 'Adicione itens do cardápio à comanda.'
  if (pending) return `Envie ${plural(pending, 'item pendente', 'itens pendentes')} para a cozinha antes de pedir a conta.`
  if (inKitchen) {
    return `Aguardando a cozinha: ${plural(inKitchen, 'item ainda não está pronto', 'itens ainda não estão prontos')}.`
  }
  return null
}

function Menu({ menu, onPick }) {
  const [category, setCategory] = useState(ALL_CATEGORIES)

  const categories = [ALL_CATEGORIES, ...new Set(menu.map((item) => item.category))]
  const visibleItems =
    category === ALL_CATEGORIES ? menu : menu.filter((item) => item.category === category)

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Cardápio</h2>
          <p>Toque no produto para escolher a quantidade e a observação.</p>
        </div>
      </div>

      <div className="category-row">
        {categories.map((name) => (
          <button
            key={name}
            className={name === category ? 'category active' : 'category'}
            aria-pressed={name === category}
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Spec 012: o card inteiro abre o modal de adicionar. */}
      <div className="menu-list">
        {visibleItems.map((item) => (
          <button className="menu-pick" key={item.id} onClick={() => onPick(item)}>
            <span>
              <b>{item.name}</b>
              <small>{item.category}</small>
              <strong>{formatMoney(item.price)}</strong>
            </span>
            <span className="add-btn" aria-hidden="true">
              +
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

// O total é só uma prévia: o preço vale o do momento do lançamento, congelado no backend (RN-09).
function AddItemModal({ item, busy, error, onConfirm, onClose }) {
  const [quantity, setQuantity] = useState(1)

  function handleSubmit(event) {
    event.preventDefault()
    onConfirm({ quantity, notes: new FormData(event.target).get('notes') })
  }

  return (
    <Modal
      title={item.name}
      description={`${item.category} · ${formatMoney(item.price)} cada`}
      busy={busy}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        {error && <div className="alert error">{error}</div>}
        <div className="quantity-field">
          <span>Quantidade</span>
          <QuantityStepper value={quantity} onChange={setQuantity} disabled={busy} />
        </div>
        <label>
          Observação
          <textarea name="notes" rows="2" maxLength={255} placeholder="Ex.: sem cebola, bem passado" />
        </label>
        <div className="modal-actions">
          <button type="button" className="outline-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="primary-btn" disabled={busy}>
            Adicionar à comanda · {formatMoney(item.price * quantity)}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function OrderItem({ item, busy, onQuantityChange, onRemove, onCancel }) {
  // RN-04: depois de enviado à cozinha, o item não pode mais ser alterado.
  const editable = item.status === 'pending'

  return (
    <div className="order-item">
      <div className="order-item-main">
        <b>{item.name}</b>
        <small>{item.notes || 'Sem observações'}</small>
        <span className={`item-status ${item.status}`}>{ITEM_STATUS_LABELS[item.status]}</span>
      </div>
      <div className="item-controls">
        {editable ? (
          <>
            <QuantityStepper
              value={item.quantity}
              onChange={onQuantityChange}
              disabled={busy}
              label={`Quantidade de ${item.name}`}
            />
            <button
              className="remove-btn"
              aria-label="Remover item"
              disabled={busy}
              onClick={onRemove}
            >
              ×
            </button>
          </>
        ) : (
          <>
            <span>Qtd. {item.quantity}</span>
            {onCancel && item.status !== 'canceled' && (
              <button
                className="remove-btn"
                aria-label={`Cancelar ${item.name}`}
                title="Cancelar item enviado"
                disabled={busy}
                onClick={onCancel}
              >
                ×
              </button>
            )}
          </>
        )}
      </div>
      <strong>{formatMoney(item.unitPrice * item.quantity)}</strong>
    </div>
  )
}
