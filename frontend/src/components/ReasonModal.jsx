import { useEffect, useRef } from 'react'

// Modal de confirmação que exige um motivo (RN-05 e RN-11).
// `onConfirm(reason)` deve resolver com true quando a ação der certo.
export default function ReasonModal({ title, description, confirmLabel, busy, error, onConfirm, onClose }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    dialogRef.current.showModal()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    const reason = new FormData(event.target).get('reason').trim()
    if (reason && (await onConfirm(reason))) onClose()
  }

  return (
    <dialog ref={dialogRef} className="modal" onCancel={onClose} aria-labelledby="reason-modal-title">
      <form onSubmit={handleSubmit}>
        <h2 id="reason-modal-title">{title}</h2>
        {description && <p>{description}</p>}
        {error && <div className="alert error">{error}</div>}
        <label>
          Motivo
          <textarea name="reason" rows="3" required autoFocus placeholder="Ex.: cliente desistiu" />
        </label>
        <div className="button-row">
          <button type="button" className="outline-btn" onClick={onClose} disabled={busy}>
            Voltar
          </button>
          <button className="primary-btn" disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}
