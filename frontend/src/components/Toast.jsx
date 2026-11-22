import { useEffect, useRef, useState } from 'react'

// Aviso curto de sucesso (spec 012); some sozinho depois de `duration` ms.
// `stamp` muda a cada disparo: a mesma mensagem repetida reinicia o tempo.
export default function Toast({ message, stamp, onDone, duration = 3000 }) {
  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(onDone, duration)
    return () => clearTimeout(timer)
  }, [message, stamp])

  if (!message) return null
  return (
    <div className="toast" role="status">
      {message}
    </div>
  )
}

// Estado do aviso para a página: `showToast(texto)` e `<Toast {...toastProps} />`.
export function useToast() {
  const [toast, setToast] = useState(null)
  const counter = useRef(0)
  return {
    showToast: (text) => setToast({ text, stamp: ++counter.current }),
    toastProps: { message: toast?.text ?? '', stamp: toast?.stamp, onDone: () => setToast(null) },
  }
}
