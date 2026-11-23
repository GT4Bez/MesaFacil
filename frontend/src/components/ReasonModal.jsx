import Modal from './Modal'

// Modal de confirmação com motivo (RN-05 e RN-11 exigem; na reabertura da conta, spec 019, é opcional).
// `onConfirm(reason)` deve resolver com true quando a ação der certo.
export default function ReasonModal({
  title,
  description,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
  optional = false,
  placeholder = 'Ex.: cliente desistiu',
  maxLength = null,
}) {
  async function handleSubmit(event) {
    event.preventDefault()
    const field = event.currentTarget.elements.reason
    const reason = field.value.trim()
    if (!reason && !optional) {
      field.value = ''
      field.reportValidity()
      return
    }
    // O limite vale para o texto sem os espaços das pontas, como na API.
    if (maxLength && reason.length > maxLength) {
      field.setCustomValidity(`Use até ${maxLength} caracteres (hoje: ${reason.length}).`)
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
          {optional ? 'Motivo (opcional)' : 'Motivo'}
          <textarea
            name="reason"
            rows="3"
            required={!optional}
            autoFocus
            onInput={(event) => event.currentTarget.setCustomValidity('')}
            placeholder={placeholder}
          />
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
