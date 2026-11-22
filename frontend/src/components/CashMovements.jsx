import { useState } from 'react'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import { CASH_MOVEMENT_LABELS, formatMoney } from '../utils/format'

const SUCCESS_MESSAGES = {
  withdrawal: 'Sangria registrada com sucesso!',
  reinforcement: 'Reforço registrado com sucesso!',
}

const formatTime = (value) => new Date(value).toLocaleTimeString('pt-BR', { timeStyle: 'short' })

// RN-13: sangria e reforço da gaveta. As regras (motivo, valor, saldo da gaveta) são do backend;
// o formulário nunca mostra o dinheiro esperado, que é só do gerente no relatório.
export function CashMovementForm({ shiftId, onRegistered }) {
  const { busy, error, run } = useAction()
  const [success, setSuccess] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    const form = event.target
    const data = new FormData(form)
    const type = data.get('type')
    const amount = data.get('amount')
    setSuccess('')
    const saved = await run(async () => {
      await api.post(`/shifts/${shiftId}/cash-movements`, {
        type,
        amount: amount === '' ? null : Number(amount),
        reason: data.get('reason'),
      })
      await onRegistered?.()
    })
    if (saved) {
      form.reset()
      setSuccess(SUCCESS_MESSAGES[type])
    }
  }

  return (
    <form className="payment-form cash-movement-form" onSubmit={handleSubmit}>
      <label>
        Movimento
        <select name="type" defaultValue="withdrawal" disabled={busy}>
          <option value="withdrawal">Sangria (retirada)</option>
          <option value="reinforcement">Reforço (suprimento)</option>
        </select>
      </label>
      <label>
        Valor (R$)
        <input name="amount" type="number" min="0.01" step="0.01" placeholder="0,00" required disabled={busy} />
      </label>
      <label className="full-row">
        Motivo
        <input name="reason" maxLength={200} placeholder="Ex.: depósito no cofre" required disabled={busy} />
      </label>
      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}
      <button className="primary-btn" disabled={busy}>
        Registrar movimento
      </button>
    </form>
  )
}

export function CashMovementTable({ movements }) {
  if (!movements.length) return <div className="empty-state">Nenhum movimento registrado.</div>
  return (
    <table className="report-table cash-movement-table">
      <thead>
        <tr>
          <th>Movimento</th>
          <th>Motivo · por</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        {movements.map((movement) => (
          <tr key={movement.id}>
            <td>
              <b>{CASH_MOVEMENT_LABELS[movement.type]}</b>
              <small className="muted">{formatTime(movement.createdAt)}</small>
            </td>
            <td>
              {movement.reason ?? '—'}
              <small className="muted">{movement.by}</small>
            </td>
            <td className={movement.type === 'withdrawal' ? 'red-text' : undefined}>
              {movement.type === 'withdrawal' ? '− ' : ''}
              {formatMoney(movement.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
