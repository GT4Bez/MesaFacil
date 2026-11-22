import { useState } from 'react'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import { formatMoney, PAYMENT_METHOD_LABELS } from '../utils/format'

const METHODS = ['cash', 'card', 'pix']
const formatTime = (value) => new Date(value).toLocaleTimeString('pt-BR', { timeStyle: 'short' })

// RN-14: contagem cega do caixa. A tela nunca mostra o valor esperado: o caixa só informa
// o que contou, e o gerente confere as diferenças na tela Turno.
export function ShiftCountForm({ shift, onCounted }) {
  const { busy, error, run } = useAction()
  const [success, setSuccess] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    const form = event.target
    const data = new FormData(form)
    const declared = Object.fromEntries(
      METHODS.map((method) => [method, data.get(method) === '' ? null : Number(data.get(method))]),
    )
    setSuccess('')
    let result = null
    const saved = await run(async () => {
      result = await api.put(`/shifts/${shift.id}/count`, { declared, note: data.get('note') })
      await onCounted?.()
    })
    if (saved) {
      form.reset()
      setSuccess(`Contagem registrada às ${formatTime(result.countedAt)}. O gerente confere e encerra o turno.`)
    }
  }

  return (
    <form className="payment-form shift-count-form" onSubmit={handleSubmit}>
      {shift.countedAt && !success && (
        <div className="alert success full-row">
          Contagem registrada às {formatTime(shift.countedAt)}. Se algo mudou na gaveta, conte de novo.
        </div>
      )}
      {METHODS.map((method) => (
        <label key={method}>
          {PAYMENT_METHOD_LABELS[method]} contado (R$)
          <input name={method} type="number" min="0" step="0.01" placeholder="0,00" required disabled={busy} />
        </label>
      ))}
      <label className="full-row">
        Observação (opcional)
        <input name="note" maxLength={200} placeholder="Ex.: comprovantes do Pix conferidos" disabled={busy} />
      </label>
      {error && <div className="alert error full-row">{error}</div>}
      {success && <div className="alert success full-row">{success}</div>}
      <button className="primary-btn" disabled={busy}>
        {shift.countedAt ? 'Contar de novo' : 'Registrar contagem'}
      </button>
    </form>
  )
}

const differenceClass = (value) => (value === 0 ? 'diff-zero' : value < 0 ? 'diff-negative' : 'diff-positive')
const formatDifference = (value) => (value > 0 ? `+${formatMoney(value)}` : formatMoney(value))

// RN-14: declarado × esperado × diferença por forma (só para o gerente, no relatório).
export function ClosingTable({ closing }) {
  return (
    <table className="report-table closing-table">
      <thead>
        <tr>
          <th>Forma</th>
          <th>Declarado</th>
          <th>Esperado</th>
          <th>Diferença</th>
        </tr>
      </thead>
      <tbody>
        {closing.methods.map((row) => (
          <tr key={row.method}>
            <td>{PAYMENT_METHOD_LABELS[row.method]}</td>
            <td>{formatMoney(row.declared)}</td>
            <td>{formatMoney(row.expected)}</td>
            <td className={differenceClass(row.difference)}>{formatDifference(row.difference)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Bloco "Conferência" da tela Turno: com o turno aberto, o gerente confere e encerra.
export function ShiftClosingPanel({ shift, closing, busy, onClose }) {
  const open = shift.status === 'open'
  if (!open && !closing) return null
  const hasDifference = closing?.methods.some((row) => row.difference !== 0)
  const canClose = open && closing && !closing.stale

  function handleSubmit(event) {
    event.preventDefault()
    const reason = new FormData(event.target).get('reason') ?? ''
    onClose(reason.trim())
  }

  return (
    <section className="panel shift-closing" aria-labelledby="closing-title">
      <div className="panel-heading">
        <div>
          <h2 id="closing-title">Conferência</h2>
          <p>
            {closing
              ? `Contagem cega feita por ${closing.countedBy} às ${formatTime(closing.countedAt)}.`
              : 'Contagem cega do caixa (RN-14).'}
          </p>
        </div>
      </div>

      {!closing && (
        <div className="empty-state">
          O caixa ainda não fez a contagem de fechamento (Frente de caixa → Contagem de fechamento).
        </div>
      )}
      {closing && <ClosingTable closing={closing} />}
      {closing?.note && <p className="closing-note">Observação do caixa: {closing.note}</p>}
      {closing?.stale && open && (
        <div className="alert warning">
          Houve pagamento ou movimento de caixa depois da contagem: peça ao caixa uma nova contagem.
        </div>
      )}

      {open ? (
        <form className="modal-form closing-form" onSubmit={handleSubmit}>
          {hasDifference && canClose && (
            <label>
              Motivo da diferença
              <textarea name="reason" rows="2" required placeholder="Ex.: faltou troco de 2,50" />
            </label>
          )}
          <button className="dark-btn" disabled={busy || !canClose}>
            Encerrar turno
          </button>
          {!canClose && (
            <small className="hint">O turno só é encerrado depois de uma contagem válida do caixa.</small>
          )}
        </form>
      ) : (
        <p className="closing-note">
          {closing.reason ? `Motivo da diferença: ${closing.reason}` : 'Sem diferença na conferência.'}
          {shift.closedBy && ` · Encerrado por ${shift.closedBy}.`}
        </p>
      )}
    </section>
  )
}
