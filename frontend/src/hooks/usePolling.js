import { useEffect, useRef, useState } from 'react'

// Spec 020: atualização em segundo plano (sem WebSocket) para KDS, Salão e Caixa.
// - chama `callback(isActive)` a cada `intervalMs`, sem sobrepor chamadas (agenda a próxima ao terminar);
// - pausa com a aba oculta e, ao voltar, atualiza na hora;
// - pausa com `enabled: false` (ação em andamento ou modal aberto);
// - `isActive()` fica falso depois de desmontar ou pausar: a tela descarta a resposta atrasada.
// Devolve `error`: a mensagem da última falha em segundo plano, limpa na próxima atualização bem-sucedida.
export function usePolling(callback, intervalMs, { enabled = true } = {}) {
  const saved = useRef(callback)
  const [error, setError] = useState('')

  useEffect(() => {
    saved.current = callback
  })

  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    let running = false
    let timer = null
    const isActive = () => active

    const hidden = () => document.visibilityState === 'hidden'
    function schedule() {
      clearTimeout(timer)
      if (active && !hidden()) timer = setTimeout(tick, intervalMs)
    }
    async function tick() {
      if (!active || running) return
      running = true
      try {
        await saved.current(isActive)
        if (active) setError('')
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        running = false
        schedule()
      }
    }
    function onVisibilityChange() {
      if (hidden()) clearTimeout(timer)
      else tick()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    schedule()
    return () => {
      active = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [intervalMs, enabled])

  return { error }
}
