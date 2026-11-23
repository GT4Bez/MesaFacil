import { useEffect, useState } from 'react'
import { useAction } from '../hooks/useAction'
import { usePolling } from '../hooks/usePolling'
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

  async function load(isActive = () => true) {
    const data = await api.get('/kitchen/orders')
    if (!isActive()) return
    setOrders(data)
    setNow(Date.now())
  }

  useEffect(() => {
    run(load)
  }, [])

  // Spec 020: polling em segundo plano; não trava botões nem limpa erro de ação.
  const { error: pollError } = usePolling(load, POLLING_MS, { enabled: !busy })

  const advance = (item) =>
    run(async () => {
      await api.patch(`/order-items/${item.id}/status`, { status: NEXT_STATUS[item.status].status })
      await load()
    })

  const displayError = error || pollError

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">COZINHA</span>
          <h1>Fila de preparo</h1>
          <p>Itens enviados pelo salão, do mais antigo para o mais novo. Atualiza a cada 5 segundos.</p>
        </div>
      </div>

      {displayError && <div className="alert error">{displayError}</div>}

      {!orders ? (
        !displayError && <div className="empty-state">Carregando fila...</div>
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
