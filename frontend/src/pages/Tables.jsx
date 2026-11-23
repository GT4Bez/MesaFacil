import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import StatCard from '../components/StatCard'
import { hasRole } from '../utils/access'

export default function Tables() {
  const [tables, setTables] = useState(null)
  const [shift, setShift] = useState(null)
  const { user } = useAuth()
  const { busy, error, run } = useAction()
  const navigate = useNavigate()

  async function load() {
    const [tableData, activeShift] = await Promise.all([
      api.get('/tables'),
      api.get('/shifts/active'),
    ])
    setTables(tableData)
    setShift(activeShift)
  }

  useEffect(() => {
    run(load)
  }, [])

  const shiftOpen = shift?.status === 'open'
  const isManager = hasRole(user, 'manager')
  const canOpenOrder = hasRole(user, 'waiter', 'manager')
  const occupiedCount = tables?.filter((table) => table.status === 'occupied').length
  // Spec 019: mesas com a conta pedida, esperando o caixa.
  const awaitingCount = tables?.filter((table) => table.orderStatus === 'ready_to_pay').length

  function openTable(table) {
    if (table.status === 'occupied') {
      navigate(`/orders/${table.activeOrderId}`)
      return
    }
    run(async () => {
      const order = await api.post('/orders', { tableId: table.id })
      navigate(`/orders/${order.id}`)
    })
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">VISÃO GERAL</span>
          <h1>Salão e mesas</h1>
          <p>Acompanhe a ocupação e inicie novos atendimentos.</p>
        </div>
        <button className="outline-btn" disabled={busy} onClick={() => run(load)}>
          ↻ Atualizar
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {!tables ? (
        !error && <div className="empty-state">Carregando mesas...</div>
      ) : (
        <>
          <section className={`shift-banner ${shiftOpen ? 'shift-open' : 'shift-closed'}`}>
            <div>
              <span className="shift-icon">◷</span>
              <div>
                <b>Turno {shiftOpen ? 'aberto' : 'fechado'}</b>
                <p>
                  {shiftOpen
                    ? 'O salão está liberado para novos atendimentos.'
                    : 'Não é possível iniciar atendimentos até o gerente abrir o turno.'}
                </p>
              </div>
            </div>
            {/* RN-13: abrir exige o fundo de troco; RN-14: encerrar exige a conferência. Ambos na tela Turno. */}
            {isManager &&
              (shiftOpen ? (
                <Link className="dark-btn" to="/admin/shift">
                  Conferir e encerrar →
                </Link>
              ) : (
                <Link className="primary-btn" to="/admin/shift">
                  Abrir turno →
                </Link>
              ))}
          </section>

          <div className="stats-grid">
            <StatCard label="Total de mesas" value={tables.length} hint="no restaurante" />
            <StatCard
              label="Mesas disponíveis"
              value={tables.length - occupiedCount}
              hint="prontas para atender"
              valueClassName="green-text"
            />
            <StatCard
              label="Mesas ocupadas"
              value={occupiedCount}
              hint={awaitingCount ? `${awaitingCount} aguardando pagamento` : 'em atendimento'}
              valueClassName="red-text"
            />
          </div>

          <div className="section-heading">
            <div>
              <h2>Mapa de mesas</h2>
              <p>Selecione uma mesa para acessar ou iniciar uma comanda.</p>
            </div>
            <div className="legend">
              <span>
                <i className="dot available" /> Livre
              </span>
              <span>
                <i className="dot occupied" /> Ocupada
              </span>
              <span>
                <i className="dot awaiting" /> Aguardando pagamento
              </span>
            </div>
          </div>

          <div className="table-grid">
            {tables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                canOpenOrder={canOpenOrder}
                // RN-02 e Spec 004: mesa livre só abre com turno ativo e perfil de salão/gerência.
                disabled={busy || (table.status === 'available' && (!shiftOpen || !canOpenOrder))}
                onClick={() => openTable(table)}
              />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function TableCard({ table, canOpenOrder, disabled, onClick }) {
  const occupied = table.status === 'occupied'
  // Spec 019: conta pedida, esperando o caixa.
  const awaiting = table.orderStatus === 'ready_to_pay'
  const label = awaiting ? 'Aguardando pagamento' : occupied ? 'Ocupada' : 'Livre'
  const action = awaiting
    ? 'Conta pedida · ver comanda →'
    : occupied
      ? 'Ver comanda →'
      : canOpenOrder
        ? 'Iniciar atendimento +'
        : 'Somente visualização'

  return (
    <button
      className={`table-card ${table.status}${awaiting ? ' awaiting' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="table-top">
        <span>MESA</span>
        <span className="table-status">{label}</span>
      </span>
      <strong>{table.number}</strong>
      <small>{action}</small>
    </button>
  )
}
