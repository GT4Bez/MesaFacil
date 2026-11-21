import { useEffect, useState } from 'react'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import { formatMoney, PAYMENT_METHOD_LABELS } from '../utils/format'

export default function Cashier() {
  const [tables, setTables] = useState([])
  const [orderId, setOrderId] = useState(null)
  const [bill, setBill] = useState(null)
  const [success, setSuccess] = useState('')
  const [lastChange, setLastChange] = useState(0)
  const { busy, error, run } = useAction()

  async function loadTables() {
    const allTables = await api.get('/tables')
    setTables(allTables.filter((table) => table.status === 'occupied'))
  }

  async function loadBill() {
    setBill(await api.get(`/orders/${orderId}/bill`))
  }

  useEffect(() => {
    run(loadTables)
  }, [])

  useEffect(() => {
    if (orderId) run(loadBill)
    else setBill(null)
  }, [orderId])

  function selectOrder(id) {
    setSuccess('')
    setLastChange(0)
    setOrderId(id)
  }

  async function toggleServiceTax(enabled) {
    setSuccess('')
    setLastChange(0)
    await run(async () => {
      setBill(await api.patch(`/orders/${orderId}/service-tax`, { enabled }))
    })
  }

  async function registerPayment(payment) {
    setSuccess('')
    setLastChange(0)
    let result = null
    const paid = await run(async () => {
      result = await api.post(`/orders/${orderId}/payments`, payment)
      await loadBill()
    })
    if (paid) {
      const change = result?.changeAmount ?? 0
      setLastChange(change)
      // O troco aparece num destaque próprio no extrato, sem repetir aqui.
      setSuccess('Pagamento registrado com sucesso!')
    }
    return paid
  }

  async function closeOrder() {
    setSuccess('')
    setLastChange(0)
    const closed = await run(async () => {
      await api.patch(`/orders/${orderId}/status`, { status: 'closed' })
      await loadTables()
    })
    if (closed) {
      setOrderId(null)
      setSuccess('Pedido finalizado e mesa liberada com sucesso!')
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">FINANCEIRO</span>
          <h1>Frente de caixa</h1>
          <p>Consulte comandas, registre pagamentos e libere mesas.</p>
        </div>
        <button className="outline-btn" disabled={busy} onClick={() => run(loadTables)}>
          ↻ Atualizar mesas
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <div className="cashier-layout">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Selecionar comanda</h2>
              <p>Mesas ocupadas com pedido ativo.</p>
            </div>
          </div>
          <div className="cash-table-list">
            {tables.map((table) => (
              <button
                key={table.id}
                className={table.activeOrderId === orderId ? 'cash-table selected' : 'cash-table'}
                onClick={() => selectOrder(table.activeOrderId)}
              >
                <b>Mesa {table.number}</b>
                <small>Comanda ativa · #{table.activeOrderId}</small>
              </button>
            ))}
            {!tables.length && <div className="empty-state">Nenhuma mesa ocupada encontrada.</div>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Extrato da conta</h2>
              <p>{orderId ? `Comanda #${orderId}` : 'Selecione uma comanda para visualizar.'}</p>
            </div>
          </div>

          {bill ? (
            <Bill
              key={bill.orderId}
              bill={bill}
              busy={busy}
              lastChange={lastChange}
              onServiceTaxChange={toggleServiceTax}
              onPayment={registerPayment}
              onClose={closeOrder}
            />
          ) : (
            <div className="empty-state">O extrato da conta aparecerá aqui.</div>
          )}
        </section>
      </div>
    </>
  )
}

function clampForMethod(rawValue, method, remaining) {
  if (rawValue === '' || method === 'cash' || remaining <= 0) return rawValue
  const numeric = Number(rawValue)
  return Number.isFinite(numeric) && numeric > remaining ? String(remaining) : rawValue
}

function Bill({ bill, busy, lastChange, onServiceTaxChange, onPayment, onClose }) {
  // RN-07: a comanda só pode ser encerrada com o saldo quitado.
  const paidOff = bill.remainingBalance <= 0
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  // RN-12: cartão/Pix não passam do saldo; avisa quando o valor digitado foi limitado.
  const [limited, setLimited] = useState(false)

  function changeAmount(raw) {
    const next = clampForMethod(raw, method, bill.remainingBalance)
    setLimited(next !== raw)
    setAmount(next)
  }

  useEffect(() => {
    const next = clampForMethod(amount, method, bill.remainingBalance)
    if (next !== amount) {
      setAmount(next)
      setLimited(true)
    } else {
      setLimited(false)
    }
  }, [bill.remainingBalance, method])

  const parsedAmount = Number(amount)
  const estimatedChange =
    method === 'cash' && !paidOff && Number.isFinite(parsedAmount) && parsedAmount > bill.remainingBalance
      ? Math.round((parsedAmount - bill.remainingBalance) * 100) / 100
      : 0

  async function handleSubmit(event) {
    event.preventDefault()
    const paid = await onPayment({ amount: Number(amount), method })
    if (paid) {
      setAmount('')
      setLimited(false)
    }
  }

  return (
    <>
      <label className="toggle-line">
        <input
          type="checkbox"
          checked={bill.serviceTax}
          disabled={busy}
          onChange={(e) => onServiceTaxChange(e.target.checked)}
        />
        Incluir 10% de taxa de serviço
      </label>

      <div className="bill-items">
        {bill.items.map((item) => (
          <div className="bill-item" key={item.id}>
            <div>
              <b>{item.name}</b>
              <small>
                {item.quantity} × {formatMoney(item.unitPrice)}
              </small>
            </div>
            <strong>{formatMoney(item.unitPrice * item.quantity)}</strong>
          </div>
        ))}
      </div>

      <div className="bill-line">
        <span>Subtotal</span>
        <b>{formatMoney(bill.subtotal)}</b>
      </div>
      {bill.serviceTax && (
        <div className="bill-line">
          <span>Taxa de serviço (10%)</span>
          <b>{formatMoney(bill.serviceTaxAmount)}</b>
        </div>
      )}
      <div className="bill-total">
        <span>Total da conta</span>
        <strong>{formatMoney(bill.total)}</strong>
      </div>

      <h3 className="subheading">Registrar pagamento</h3>
      <form onSubmit={handleSubmit} className="payment-form">
        <label>
          Valor (R$)
          <input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            max={method === 'cash' ? undefined : bill.remainingBalance}
            value={amount}
            onChange={(e) => changeAmount(e.target.value)}
            disabled={busy || paidOff}
            placeholder="0,00"
            required
          />
        </label>
        <label>
          Forma de pagamento
          <select name="method" value={method} onChange={(e) => setMethod(e.target.value)} disabled={busy || paidOff}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-btn" disabled={busy || paidOff}>
          Adicionar pagamento
        </button>
      </form>
      {limited && method !== 'cash' && !paidOff && (
        <div className="alert warning">
          Cartão e Pix aceitam no máximo o saldo devedor ({formatMoney(bill.remainingBalance)}). Para
          receber a mais, use Dinheiro: o troco é calculado.
        </div>
      )}
      {estimatedChange > 0 && (
        <div className="alert warning">Troco estimado: {formatMoney(estimatedChange)}</div>
      )}
      {lastChange > 0 && (
        <div className="alert success">Troco: {formatMoney(lastChange)}</div>
      )}

      <h3 className="subheading">Pagamentos efetuados</h3>
      {bill.payments.map((payment) => (
        <div className="bill-line" key={payment.id}>
          <span>
            {PAYMENT_METHOD_LABELS[payment.method]} ·{' '}
            {new Date(payment.createdAt).toLocaleTimeString('pt-BR', { timeStyle: 'short' })}
          </span>
          <b>
            {formatMoney(payment.amount)}
            {payment.changeAmount > 0 && ` (troco ${formatMoney(payment.changeAmount)})`}
          </b>
        </div>
      ))}
      {!bill.payments.length && <small className="muted">Nenhum pagamento registrado.</small>}

      <div className="balance-card">
        <span>Saldo devedor</span>
        <strong>{formatMoney(bill.remainingBalance)}</strong>
      </div>
      <button
        className="primary-btn full close-order"
        disabled={busy || !paidOff}
        onClick={onClose}
      >
        Finalizar pedido e liberar mesa
      </button>
      {!paidOff && (
        <small className="hint">Quite o saldo para habilitar o encerramento da comanda.</small>
      )}
    </>
  )
}
