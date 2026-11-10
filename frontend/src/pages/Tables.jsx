import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'

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
  const isManager = user.role === 'manager'
  const occupiedCount = tables?.filter((table) => table.status === 'occupied').length

  function toggleShift() {
    run(async () => {
      if (shiftOpen) await api.patch(`/shifts/${shift.id}/close`)
      else await api.post('/shifts')
      await load()
    })
  }

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
            {isManager && (
              <button
                className={shiftOpen ? 'dark-btn' : 'primary-btn'}
                disabled={busy}
                onClick={toggleShift}
              >
                {shiftOpen ? 'Encerrar turno' : 'Abrir turno'}
              </button>
            )}
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
              hint="em atendimento"
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
            </div>
          </div>

          <div className="table-grid">
            {tables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                // RN-02: sem turno aberto, mesa livre não inicia atendimento.
                disabled={busy || (table.status === 'available' && !shiftOpen)}
                onClick={() => openTable(table)}
              />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function StatCard({ label, value, hint, valueClassName }) {
  return (
    <div className="stat-card">
      <small>{label}</small>
      <strong className={valueClassName}>{value}</strong>
      <span>{hint}</span>
    </div>
  )
}

function TableCard({ table, disabled, onClick }) {
  const occupied = table.status === 'occupied'

  return (
    <button className={`table-card ${table.status}`} disabled={disabled} onClick={onClick}>
      <span className="table-top">
        <span>MESA</span>
        <span className="table-status">{occupied ? 'Ocupada' : 'Livre'}</span>
      </span>
      <strong>{table.number}</strong>
      <small>{occupied ? 'Ver comanda →' : 'Iniciar atendimento +'}</small>
    </button>
  )
}
