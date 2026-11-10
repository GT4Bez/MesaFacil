import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import { formatMoney, ITEM_STATUS_LABELS, ORDER_STATUS_LABELS } from '../utils/format'

const ALL_CATEGORIES = 'Todos'

export default function Order() {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [menu, setMenu] = useState([])
  const { busy, error, run } = useAction()

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

  const addItem = (item) => change(() => api.post(`/orders/${id}/items`, item))
  const setQuantity = (item, quantity) =>
    change(() => api.patch(`/order-items/${item.id}/quantity`, { quantity }))
  const removeItem = (item) =>
    change(() => api.patch(`/order-items/${item.id}/status`, { status: 'canceled' }))
  const setStatus = (status) => change(() => api.patch(`/orders/${id}/status`, { status }))

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
        <Link className="outline-btn" to="/tables">
          ← Voltar às mesas
        </Link>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="order-layout">
        <Menu menu={menu} busy={busy} onAdd={addItem} />

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
        </section>
      </div>
    </>
  )
}

function Menu({ menu, busy, onAdd }) {
  const [category, setCategory] = useState(ALL_CATEGORIES)
  const [selected, setSelected] = useState(null)

  const categories = [ALL_CATEGORIES, ...new Set(menu.map((item) => item.category))]
  const visibleItems =
    category === ALL_CATEGORIES ? menu : menu.filter((item) => item.category === category)

  async function handleSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.target)
    const added = await onAdd({
      menuItemId: selected.id,
      quantity: Number(form.get('quantity')),
      notes: form.get('notes'),
    })
    if (added) setSelected(null)
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Cardápio</h2>
          <p>Escolha os produtos para adicionar à comanda.</p>
        </div>
      </div>

      <div className="category-row">
        {categories.map((name) => (
          <button
            key={name}
            className={name === category ? 'category active' : 'category'}
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="menu-list">
        {visibleItems.map((item) => (
          <div className="menu-item" key={item.id}>
            <div>
              <b>{item.name}</b>
              <small>{item.category}</small>
              <strong>{formatMoney(item.price)}</strong>
            </div>
            <button
              className="add-btn"
              aria-label={`Adicionar ${item.name}`}
              onClick={() => setSelected(item)}
            >
              +
            </button>
          </div>
        ))}
      </div>

      {selected && (
        // A key reinicia os campos ao trocar o item selecionado.
        <form className="add-form" key={selected.id} onSubmit={handleSubmit}>
          <b>Adicionar: {selected.name}</b>
          <div className="form-row">
            <label>
              Quantidade
              <input name="quantity" type="number" min="1" defaultValue="1" required />
            </label>
            <label className="grow">
              Observação
              <input name="notes" placeholder="Ex.: sem cebola, bem passado" />
            </label>
          </div>
          <div className="button-row">
            <button type="button" className="outline-btn" onClick={() => setSelected(null)}>
              Cancelar
            </button>
            <button className="primary-btn" disabled={busy}>
              Adicionar à comanda
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function OrderItem({ item, busy, onQuantityChange, onRemove }) {
  // RN-04: depois de enviado à cozinha, o item não pode mais ser alterado.
  const editable = item.status === 'pending'

  function handleBlur(event) {
    const quantity = Number(event.target.value)
    if (quantity >= 1 && quantity !== item.quantity) onQuantityChange(quantity)
  }

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
            <input
              aria-label="Quantidade"
              type="number"
              min="1"
              defaultValue={item.quantity}
              onBlur={handleBlur}
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
          <span>Qtd. {item.quantity}</span>
        )}
      </div>
      <strong>{formatMoney(item.unitPrice * item.quantity)}</strong>
    </div>
  )
}
