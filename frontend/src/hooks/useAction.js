import { useState } from 'react'

// Executa uma chamada assíncrona controlando os estados de "ocupado" e de erro.
// `run` resolve com true quando a ação termina sem erro.
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, run }
}
