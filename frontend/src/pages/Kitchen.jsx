import { useEffect, useState } from 'react'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import { ITEM_STATUS_LABELS } from '../utils/format'

const POLLING_MS = 5000
const NEXT_STATUS = {
  sent: { status: 'preparing', label: 'Iniciar preparo' },
  preparing: { status: 'ready', label: 'Pronto ✓' },
}

// Minutos desde o envio, para a cozinha ver há quanto tempo o item espera.
function waitingTime(sentAt, now) {
  const minutes = Math.max(0, Math.floor((now - new Date(sentAt).getTime()) / 60000))
  return minutes < 1 ? 'agora' : `${minutes} min`
}

export default function Kitchen() {
  const [orders, setOrders] = useState(null)
  const [now, setNow] = useState(Date.now())
  const { busy, error, run } = useAction()

  async function load() {
    setOrders(await api.get('/kitchen/orders'))
    setNow(Date.now())
  }

  useEffect(() => {
    run(load)
    // Polling simples (sem WebSocket): a fila se atualiza sozinha a cada 5 s.
    const timer = setInterval(() => run(load), POLLING_MS)
    return () => clearInterval(timer)
  }, [])

  const advance = (item) =>
    run(async () => {
      await api.patch(`/order-items/${item.id}/status`, { status: NEXT_STATUS[item.status].status })
      await load()
    })

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">COZINHA</span>
          <h1>Fila de preparo</h1>
          <p>Itens enviados pelo salão, do mais antigo para o mais novo. Atualiza a cada 5 segundos.</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {!orders ? (
        !error && <div className="empty-state">Carregando fila...</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">Nenhum item na fila. Tudo pronto por aqui!</div>
      ) : (
        <div className="kds-grid">
          {orders.map((order) => (
            <section className="panel kds-card" key={order.orderId}>
              <div className="kds-card-heading">
                <h2>Mesa {order.table.number}</h2>
                <small>Pedido #{order.orderId}</small>
              </div>
              {order.items.map((item) => (
                <div className="kds-item" key={item.id}>
                  <div>
                    <b>
                      {item.quantity}× {item.name}
                    </b>
                    {item.notes && <p className="kds-notes">{item.notes}</p>}
                    <small>
                      <span className={`item-status ${item.status}`}>{ITEM_STATUS_LABELS[item.status]}</span>{' '}
                      há {waitingTime(item.sentAt, now)}
                    </small>
                  </div>
                  <button
                    className={item.status === 'sent' ? 'outline-btn' : 'primary-btn'}
                    disabled={busy}
                    onClick={() => advance(item)}
                  >
                    {NEXT_STATUS[item.status].label}
                  </button>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  )
}
