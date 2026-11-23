import { useEffect, useState } from 'react'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'

const formatDateTime = (value) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

// Spec 022 (RN-21): configurações do sistema, só o admin altera. Cada mudança vai para a auditoria.
export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [max, setMax] = useState('')
  const [saved, setSaved] = useState(false)
  const { busy, error, run } = useAction()

  function apply(data) {
    setSettings(data)
    setMax(String(data.maxItemQuantityPerLaunch))
  }

  useEffect(() => {
    run(async () => apply(await api.get('/settings')))
  }, [])

  async function save(event) {
    event.preventDefault()
    setSaved(false)
    const ok = await run(async () => apply(await api.patch('/settings', { maxItemQuantityPerLaunch: Number(max) })))
    setSaved(ok)
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO</span>
          <h1>Configurações</h1>
          <p>Regras do sistema que o administrador ajusta sem mexer no código.</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {saved && !error && (
        <div className="alert success" role="status">
          Configuração salva.
        </div>
      )}

      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <h2>Lançamento de itens</h2>
            <p>Evita quantidades absurdas por engano na comanda. Gerente e administrador não têm esse limite.</p>
          </div>
        </div>
        {!settings ? (
          !error && <div className="empty-state">Carregando...</div>
        ) : (
          <form className="payment-form" onSubmit={save}>
            <label>
              Máximo de unidades iguais por lançamento do garçom
              <input
                name="maxItemQuantityPerLaunch"
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                step={1}
                required
                value={max}
                onChange={(event) => {
                  setSaved(false)
                  setMax(event.target.value)
                }}
              />
            </label>
            <small className="hint">
              {settings.updatedBy
                ? `Alterado por ${settings.updatedBy} em ${formatDateTime(settings.updatedAt)}.`
                : 'Usando o padrão do sistema (10).'}
            </small>
            <button className="primary-btn" disabled={busy || max === String(settings.maxItemQuantityPerLaunch)}>
              {busy ? 'Salvando...' : 'Salvar'}
            </button>
          </form>
        )}
      </section>
    </>
  )
}
