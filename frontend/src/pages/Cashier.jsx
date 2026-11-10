import { useEffect, useState } from 'react'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import { formatMoney, PAYMENT_METHOD_LABELS } from '../utils/format'

export default function Cashier() {
  const [tables, setTables] = useState([])
  const [orderId, setOrderId] = useState(null)
  const [serviceTax, setServiceTax] = useState(true)
  const [bill, setBill] = useState(null)
  const [success, setSuccess] = useState('')
  const { busy, error, run } = useAction()

  async function loadTables() {
    const allTables = await api.get('/tables')
    setTables(allTables.filter((table) => table.status === 'occupied'))
  }

  async function loadBill() {
    setBill(await api.get(`/orders/${orderId}/bill?serviceTax=${serviceTax}`))
  }

  useEffect(() => {
    run(loadTables)
  }, [])

  // RN-08: o backend recalcula a conta com ou sem a taxa de serviço.
  useEffect(() => {
    if (orderId) run(loadBill)
    else setBill(null)
  }, [orderId, serviceTax])

  function selectOrder(id) {
    setSuccess('')
    setOrderId(id)
  }

  async function registerPayment(payment) {
    setSuccess('')
    const paid = await run(async () => {
      await api.post(`/orders/${orderId}/payments`, payment)
      await loadBill()
    })
    if (paid) setSuccess('Pagamento registrado com sucesso!')
    return paid
  }

  async function closeOrder() {
    setSuccess('')
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
              bill={bill}
              busy={busy}
              serviceTax={serviceTax}
              onServiceTaxChange={setServiceTax}
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

function Bill({ bill, busy, serviceTax, onServiceTaxChange, onPayment, onClose }) {
  // RN-07: a comanda só pode ser encerrada com o saldo quitado.
  const paidOff = bill.remainingBalance <= 0

  async function handleSubmit(event) {
    event.preventDefault()
    const form = event.target
    const data = new FormData(form)
    const paid = await onPayment({
      amount: Number(data.get('amount')),
      method: data.get('method'),
    })
    if (paid) form.reset()
  }

  return (
    <>
      <label className="toggle-line">
        <input
          type="checkbox"
          checked={serviceTax}
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
      {serviceTax && (
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
            max={bill.remainingBalance}
            placeholder="0,00"
            required
          />
        </label>
        <label>
          Forma de pagamento
          <select name="method">
            {Object.entries(PAYMENT_METHOD_LABELS).map(([method, label]) => (
              <option key={method} value={method}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-btn" disabled={busy || paidOff}>
          Adicionar pagamento
        </button>
      </form>

      <h3 className="subheading">Pagamentos efetuados</h3>
      {bill.payments.map((payment) => (
        <div className="bill-line" key={payment.id}>
          <span>
            {PAYMENT_METHOD_LABELS[payment.method]} ·{' '}
            {new Date(payment.createdAt).toLocaleTimeString('pt-BR', { timeStyle: 'short' })}
          </span>
          <b>{formatMoney(payment.amount)}</b>
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
