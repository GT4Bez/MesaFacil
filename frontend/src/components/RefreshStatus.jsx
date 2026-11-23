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
