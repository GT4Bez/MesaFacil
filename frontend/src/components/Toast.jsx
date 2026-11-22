import { useEffect } from 'react'

// Aviso curto de sucesso (spec 012); some sozinho depois de `duration` ms.
export default function Toast({ message, onDone, duration = 3000 }) {
  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(onDone, duration)
    return () => clearTimeout(timer)
  }, [message])

  if (!message) return null
  return (
    <div className="toast" role="status">
      {message}
    </div>
  )
}
