import Modal from './Modal'
import { formatMoney } from '../utils/format'

// RN-17: o caixa pede o cancelamento e o gerente digita as próprias credenciais aqui,
// sem trocar de sessão. `onConfirm({ reason, approver })` resolve com true quando der certo.
export default function AuthorizedCancelModal({ item, busy, error, onConfirm, onClose }) {
  async function handleSubmit(event) {
    event.preventDefault()
    const { reason, email, password } = event.currentTarget.elements
    if (!reason.value.trim()) {
      reason.value = ''
      reason.reportValidity()
      return
    }
    const ok = await onConfirm({
      reason: reason.value.trim(),
      approver: { email: email.value.trim(), password: password.value },
    })
    if (ok) onClose()
    else password.value = ''
  }

  return (
    <Modal
      title="Cancelar item com autorização"
      description={`${item.quantity}× ${item.name} · ${formatMoney(item.unitPrice * item.quantity)}. O gerente digita o e-mail e a senha dele para autorizar.`}
      busy={busy}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        {error && <div className="alert error">{error}</div>}
        <label>
          Motivo
          <textarea name="reason" rows="2" required autoFocus placeholder="Ex.: cliente não recebeu o prato" />
        </label>
        <fieldset className="approver-fields">
          <legend>Autorização do gerente</legend>
          <label>
            E-mail do gerente
            <input name="email" type="email" required autoComplete="off" />
          </label>
          <label>
            Senha do gerente
            <input name="password" type="password" required autoComplete="new-password" />
          </label>
        </fieldset>
        <div className="modal-actions">
          <button type="button" className="outline-btn" onClick={onClose} disabled={busy}>
            Voltar
          </button>
          <button className="primary-btn" disabled={busy}>
            Cancelar item
          </button>
        </div>
      </form>
    </Modal>
  )
}
