import { useEffect, useId, useRef } from 'react'

// Modal base (spec 012) sobre <dialog> nativo: foco preso no modal, Esc fecha e o fundo fica
// escurecido e desfocado. Clique fora ou no × também fecha, exceto durante o envio (`busy`).
// Ao fechar, o foco volta para o elemento que abriu o modal (se ele ainda existir).
// `wide`: variante mais larga no desktop (tabelas, spec 016); no celular continua o painel inferior.
export default function Modal({ title, description, busy = false, wide = false, onClose, children }) {
  const dialogRef = useRef(null)
  const titleId = useId()
  // Só fecha pelo fundo se o clique também começou no fundo: arrastar uma seleção de texto
  // de dentro do modal até fora dele não pode descartar o que foi digitado.
  const pressedOnBackdrop = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    const opener = document.activeElement
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  function requestClose() {
    if (!busy) onClose()
  }

  // Esc dispara `cancel`: o fechamento fica com o React, para respeitar o `busy`.
  function handleCancel(event) {
    event.preventDefault()
    requestClose()
  }

  // O <dialog> não tem padding: clique nele (e não no conteúdo) é clique no fundo.
  function handlePointerDown(event) {
    pressedOnBackdrop.current = event.target === dialogRef.current
  }

  function handleClick(event) {
    if (event.target === dialogRef.current && pressedOnBackdrop.current) requestClose()
    pressedOnBackdrop.current = false
  }

  return (
    <dialog
      ref={dialogRef}
      className={wide ? 'modal modal-wide' : 'modal'}
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <div className="modal-body">
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close" aria-label="Fechar" disabled={busy} onClick={requestClose}>
            ×
          </button>
        </div>
        {description && <p className="modal-description">{description}</p>}
        {children}
      </div>
    </dialog>
  )
}
