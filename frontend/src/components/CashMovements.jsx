import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import { hasRole } from '../utils/access'
import { CASH_MOVEMENT_LABELS, formatMoney } from '../utils/format'

const SUCCESS_MESSAGES = {
  withdrawal: 'Sangria registrada com sucesso!',
  reinforcement: 'Reforço registrado com sucesso!',
}

const formatTime = (value) => new Date(value).toLocaleTimeString('pt-BR', { timeStyle: 'short' })

// RN-13: sangria e reforço da gaveta. As regras (motivo, valor, saldo da gaveta) são do backend;
// o formulário nunca mostra o dinheiro esperado, que é só do gerente no relatório.
// RN-18: para o caixa, a sangria acima de `approvalLimit` pede o e-mail e a senha do gerente.
export function CashMovementForm({ shiftId, approvalLimit, onRegistered }) {
  const { user } = useAuth()
  const { busy, error, run } = useAction()
  const [success, setSuccess] = useState('')
  const [type, setType] = useState('withdrawal')
  const [amount, setAmount] = useState('')

  const needsApproval =
    type === 'withdrawal' &&
    !hasRole(user, 'manager') &&
    typeof approvalLimit === 'number' &&
    amount !== '' &&
    Number(amount) > approvalLimit

  async function handleSubmit(event) {
    event.preventDefault()
    const form = event.target
    const data = new FormData(form)
    setSuccess('')
    const saved = await run(async () => {
      await api.post(`/shifts/${shiftId}/cash-movements`, {
        type,
        amount: amount === '' ? null : Number(amount),
        reason: data.get('reason'),
        ...(needsApproval && {
          approver: { email: String(data.get('approverEmail')).trim(), password: data.get('approverPassword') },
        }),
      })
      await onRegistered?.()
    })
    // A senha do gerente nunca fica no formulário depois do envio.
    if (form.elements.approverPassword) form.elements.approverPassword.value = ''
    if (saved) {
      form.reset()
      setType('withdrawal')
      setAmount('')
      setSuccess(SUCCESS_MESSAGES[type])
    }
  }

  return (
    <form className="payment-form cash-movement-form" onSubmit={handleSubmit}>
      <label>
        Movimento
        <select name="type" value={type} onChange={(e) => setType(e.target.value)} disabled={busy}>
          <option value="withdrawal">Sangria (retirada)</option>
          <option value="reinforcement">Reforço (suprimento)</option>
        </select>
      </label>
      <label>
        Valor (R$)
        <input
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0,00"
          required
          disabled={busy}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <label className="full-row">
        Motivo
        <input name="reason" maxLength={200} placeholder="Ex.: depósito no cofre" required disabled={busy} />
      </label>
      {needsApproval && (
        <fieldset className="approver-fields full-row">
          <legend>Autorização do gerente</legend>
          <p className="muted">
            Sangria acima de {formatMoney(approvalLimit)} precisa da autorização do gerente: ele digita o e-mail e a
            senha dele aqui.
          </p>
          <label>
            E-mail do gerente
            <input name="approverEmail" type="email" required autoComplete="off" disabled={busy} />
          </label>
          <label>
            Senha do gerente
            <input name="approverPassword" type="password" required autoComplete="new-password" disabled={busy} />
          </label>
        </fieldset>
      )}
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
              <small className="muted">
                {movement.by}
                {movement.approvedBy && ` · autorizada por ${movement.approvedBy}`}
              </small>
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
