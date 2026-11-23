import { useEffect, useRef, useState } from 'react'

const SPIN_MS = 700

// Spec 020: quando a tela foi atualizada e aviso discreto se a atualização automática falhar.
const formatTime = (date) => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export function UpdatedAt({ at }) {
  if (!at) return null
  return (
    <small className="updated-at">
      Atualizado às <time dateTime={at.toISOString()}>{formatTime(at)}</time>
    </small>
  )
}

export function PollWarning({ error }) {
  if (!error) return null
  return (
    <div className="alert warning poll-warning" role="status">
      Sem conexão com o servidor. Tentando de novo...
    </div>
  )
}

// Mantém `active` verdadeiro por pelo menos `ms`, para o ícone dar uma volta inteira mesmo com resposta rápida.
function useMinimumDuration(active, ms) {
  const [shown, setShown] = useState(active)
  const startedAt = useRef(0)
  useEffect(() => {
    if (active) {
      startedAt.current = Date.now()
      setShown(true)
      return undefined
    }
    const rest = ms - (Date.now() - startedAt.current)
    if (rest <= 0) {
      setShown(false)
      return undefined
    }
    const timer = setTimeout(() => setShown(false), rest)
    return () => clearTimeout(timer)
  }, [active, ms])
  return shown
}

// Botão "Atualizar": o ícone gira durante a atualização manual (clique) e a automática (`polling`).
export function RefreshButton({ onRefresh, disabled = false, polling = false, label = 'Atualizar' }) {
  const [manual, setManual] = useState(false)
  const spinning = useMinimumDuration(manual || polling, SPIN_MS)

  async function handleClick() {
    setManual(true)
    try {
      await onRefresh()
    } finally {
      setManual(false)
    }
  }

  return (
    <button
      type="button"
      className="outline-btn refresh-btn"
      disabled={disabled || manual}
      aria-busy={spinning}
      onClick={handleClick}
    >
      <span className={spinning ? 'refresh-icon spinning' : 'refresh-icon'} aria-hidden="true">
        ↻
      </span>
      {label}
    </button>
  )
}
