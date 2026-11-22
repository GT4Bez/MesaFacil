import Modal from './Modal'

// Modal de confirmação que exige um motivo (RN-05 e RN-11).
// `onConfirm(reason)` deve resolver com true quando a ação der certo.
export default function ReasonModal({ title, description, confirmLabel, busy, error, onConfirm, onClose }) {
  async function handleSubmit(event) {
    event.preventDefault()
    const field = event.currentTarget.elements.reason
    const reason = field.value.trim()
    if (!reason) {
      field.value = ''
      field.reportValidity()
      return
    }
    if (await onConfirm(reason)) onClose()
  }

  return (
    <Modal title={title} description={description} busy={busy} onClose={onClose}>
      <form className="modal-form" onSubmit={handleSubmit}>
        {error && <div className="alert error">{error}</div>}
        <label>
          Motivo
          <textarea name="reason" rows="3" required autoFocus placeholder="Ex.: cliente desistiu" />
        </label>
        <div className="modal-actions">
          <button type="button" className="outline-btn" onClick={onClose} disabled={busy}>
            Voltar
          </button>
          <button className="primary-btn" disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
