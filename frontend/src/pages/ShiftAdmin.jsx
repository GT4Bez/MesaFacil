import { useEffect, useState } from 'react'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import StatCard from '../components/StatCard'
import { CashMovementForm, CashMovementTable } from '../components/CashMovements'
import { formatMoney, PAYMENT_METHOD_LABELS } from '../utils/format'

const formatDateTime = (value) => (value ? new Date(value).toLocaleString('pt-BR') : '—')

// Spec 010: abrir/encerrar turno e relatório (RN-10). Todos os valores vêm prontos do backend.
export default function ShiftAdmin() {
  const [activeShift, setActiveShift] = useState(null)
  // Turno escolhido para o relatório; sem escolha, mostra o turno aberto.
  const [selectedId, setSelectedId] = useState(null)
  const [report, setReport] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const { busy, error, run } = useAction()

  async function load(id = selectedId) {
    const active = await api.get('/shifts/active')
    setActiveShift(active)
    const target = id ?? active?.id
    setReport(target ? await api.get(`/shifts/${target}/report`) : null)
    setLoaded(true)
  }

  useEffect(() => {
    run(() => load())
  }, [])

  // RN-13: o turno abre com o fundo de troco (pode ser 0); a validação é do backend.
  function openShift(event) {
    event.preventDefault()
    const raw = new FormData(event.target).get('openingFloat')
    run(async () => {
      await api.post('/shifts', { openingFloat: raw === '' ? null : Number(raw) })
      setSelectedId(null)
      await load(null)
    })
  }

  // Depois de encerrar, o relatório continua na tela, agora como fechamento do turno.
  const closeShift = () =>
    run(async () => {
      const closed = await api.patch(`/shifts/${activeShift.id}/close`)
      setSelectedId(closed.id)
      await load(closed.id)
    })

  function showShift(event) {
    event.preventDefault()
    const id = new FormData(event.target).get('shiftId').trim()
    if (!id) return
    run(async () => {
      await load(id)
      setSelectedId(id)
    })
  }

  const showActive = () =>
    run(async () => {
      setSelectedId(null)
      await load(null)
    })

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO</span>
          <h1>Turno e relatório</h1>
          <p>Abra e encerre o turno e acompanhe o fechamento financeiro.</p>
        </div>
        <button className="outline-btn" disabled={busy} onClick={() => run(() => load())}>
          ↻ Atualizar
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {!loaded ? (
        !error && <div className="empty-state">Carregando turno...</div>
      ) : (
        <>
          <section className={`shift-banner ${activeShift ? 'shift-open' : 'shift-closed'}`}>
            <div>
              <span className="shift-icon">◷</span>
              <div>
                <b>{activeShift ? `Turno #${activeShift.id} aberto` : 'Nenhum turno aberto'}</b>
                <p>
                  {activeShift
                    ? `Aberto em ${formatDateTime(activeShift.openedAt)}. Só encerra sem pedidos ativos.`
                    : 'Abra um turno para liberar os atendimentos no salão.'}
                </p>
              </div>
            </div>
            {activeShift ? (
              <button className="dark-btn" disabled={busy} onClick={closeShift}>
                Encerrar turno
              </button>
            ) : (
              <form className="shift-lookup open-shift" onSubmit={openShift}>
                <label>
                  Fundo de troco (R$)
                  <input name="openingFloat" type="number" min="0" step="0.01" placeholder="0,00" required />
                </label>
                <button className="primary-btn" disabled={busy}>
                  Abrir turno
                </button>
              </form>
            )}
          </section>

          <form className="shift-lookup" onSubmit={showShift}>
            <label>
              Ver relatório do turno nº
              <input name="shiftId" inputMode="numeric" pattern="[0-9]+" placeholder="Ex.: 1" />
            </label>
            <button className="outline-btn" disabled={busy}>
              Ver relatório
            </button>
            {selectedId && activeShift && (
              <button type="button" className="outline-btn" disabled={busy} onClick={showActive}>
                Voltar ao turno aberto
              </button>
            )}
          </form>

          {report ? (
            <ShiftReport
              report={report}
              cashForm={
                activeShift?.id === report.shift.id && (
                  <CashMovementForm shiftId={activeShift.id} onRegistered={() => load()} />
                )
              }
            />
          ) : (
            <div className="empty-state">Nenhum relatório para exibir.</div>
          )}
        </>
      )}
    </>
  )
}

function ShiftReport({ report, cashForm }) {
  const { shift, cancellations, cash } = report
  const partial = shift.status === 'open'

  return (
    <>
      <div className="section-heading report-heading">
        <div>
          <h2>
            Relatório do turno #{shift.id} {partial ? '(parcial)' : '(fechado)'}
          </h2>
          <p>
            Aberto por {shift.openedBy} em {formatDateTime(shift.openedAt)}
            {shift.closedAt && ` · encerrado em ${formatDateTime(shift.closedAt)}`}
          </p>
        </div>
      </div>

      {partial && (
        <div className="alert warning">
          Turno em andamento: o total inclui pagamentos de pedidos ainda abertos; pedidos e vendas por
          item contam só os pedidos encerrados.
        </div>
      )}

      <div className="stats-grid money-stats">
        <StatCard label="Total do turno" value={formatMoney(report.totalShift)} hint="pagamentos registrados" valueClassName="green-text" />
        <StatCard label="Pedidos encerrados" value={report.ordersClosed} hint="comandas pagas" />
        <StatCard label="Ticket médio" value={formatMoney(report.averageTicket)} hint="total ÷ pedidos encerrados" />
      </div>

      <div className="report-grid">
        <section className="panel cash-summary">
          <div className="panel-heading">
            <div>
              <h2>Dinheiro na gaveta</h2>
              <p>Só o gerente vê o valor esperado (RN-13).</p>
            </div>
          </div>
          <div className="bill-line">
            <span>Fundo de troco</span>
            <b>{formatMoney(cash.openingFloat)}</b>
          </div>
          <div className="bill-line">
            <span>+ Pagamentos em dinheiro (sem o troco)</span>
            <b>{formatMoney(cash.cashPayments)}</b>
          </div>
          <div className="bill-line">
            <span>− Sangrias</span>
            <b>{formatMoney(cash.withdrawals)}</b>
          </div>
          <div className="bill-line">
            <span>+ Reforços</span>
            <b>{formatMoney(cash.reinforcements)}</b>
          </div>
          <div className="bill-total">
            <span>Dinheiro esperado</span>
            <strong>{formatMoney(cash.expected)}</strong>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Movimentos de caixa</h2>
          </div>
          {cashForm}
          <CashMovementTable movements={cash.movements} />
        </section>
      </div>

      <div className="report-grid report-cancellations">
        <section className="panel">
          <div className="panel-heading">
            <h2>Por forma de pagamento</h2>
          </div>
          <table className="report-table">
            <thead>
              <tr>
                <th>Forma</th>
                <th>Pagamentos</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {report.byPaymentMethod.map((row) => (
                <tr key={row.method}>
                  <td>{PAYMENT_METHOD_LABELS[row.method]}</td>
                  <td>{row.count}</td>
                  <td>{formatMoney(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Itens vendidos</h2>
          </div>
          {report.byMenuItem.length ? (
            <table className="report-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qtd.</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {report.byMenuItem.map((row) => (
                  <tr key={row.menuItemId}>
                    <td>{row.name}</td>
                    <td>{row.quantity}</td>
                    <td>{formatMoney(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">Nenhum pedido encerrado ainda.</div>
          )}
        </section>
      </div>

      <section className="panel report-cancellations">
        <div className="panel-heading">
          <div>
            <h2>Cancelamentos</h2>
            <p>
              {cancellations.ordersCount} pedido(s) e {cancellations.items.length} item(ns) cancelado(s)
              pelo gerente
            </p>
          </div>
        </div>
        {cancellations.orders.length || cancellations.items.length ? (
          <table className="report-table">
            <thead>
              <tr>
                <th>O quê</th>
                <th>Motivo</th>
                <th>Por</th>
              </tr>
            </thead>
            <tbody>
              {cancellations.orders.map((row) => (
                <tr key={`order-${row.orderId}`}>
                  <td>Pedido #{row.orderId}</td>
                  <td>{row.reason ?? '—'}</td>
                  <td>{row.by ?? '—'}</td>
                </tr>
              ))}
              {cancellations.items.map((row) => (
                <tr key={`item-${row.orderItemId}`}>
                  <td>
                    {row.quantity}× {row.name}
                  </td>
                  <td>{row.reason}</td>
                  <td>{row.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">Nenhum cancelamento neste turno.</div>
        )}
      </section>
    </>
  )
}
