import { useEffect, useState } from 'react'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import Modal from '../components/Modal'
import Toast from '../components/Toast'
import { formatMoney, formatQuantity, UNIT_LABELS } from '../utils/format'

const EMPTY_FORM = { id: null, name: '', unit: 'kg', minStock: '', unitCost: '', active: true }
const toNumber = (value) => (value === '' ? null : Number(value))

// RN-15 (spec 009): insumos do gerente. O estoque só muda por entrada, ajuste ou venda (baixa automática).
export default function Ingredients() {
  const [ingredients, setIngredients] = useState(null)
  // Modal aberto: { kind: 'form' | 'purchase' | 'adjustment', ingredient, values }
  const [dialog, setDialog] = useState(null)
  const [toast, setToast] = useState('')
  const { busy, error, clearError, run } = useAction()

  async function load() {
    setIngredients(await api.get('/ingredients'))
  }

  useEffect(() => {
    run(load)
  }, [])

  function open(kind, ingredient = null, values = {}) {
    clearError()
    setDialog({ kind, ingredient, values })
  }
  function close() {
    clearError()
    setDialog(null)
  }
  const setValue = (field) => (event) =>
    setDialog({
      ...dialog,
      values: { ...dialog.values, [field]: field === 'active' ? event.target.checked : event.target.value },
    })

  async function submit(event) {
    event.preventDefault()
    const { kind, ingredient, values } = dialog
    let message = ''
    const saved = await run(async () => {
      if (kind === 'form') {
        const body = { name: values.name, minStock: toNumber(values.minStock) ?? 0, unitCost: toNumber(values.unitCost) ?? 0 }
        if (ingredient) await api.patch(`/ingredients/${ingredient.id}`, { ...body, active: values.active })
        else await api.post('/ingredients', { ...body, unit: values.unit })
        message = ingredient ? `${values.name}: alterações salvas` : `${values.name} cadastrado`
      } else if (kind === 'purchase') {
        const result = await api.post(`/ingredients/${ingredient.id}/purchases`, {
          quantity: toNumber(values.quantity),
          unitCost: toNumber(values.unitCost),
        })
        message = `Entrada registrada: ${ingredient.name} agora com ${formatQuantity(result.stockQuantity, result.unit)}`
      } else {
        await api.post(`/ingredients/${ingredient.id}/adjustments`, {
          countedQuantity: toNumber(values.countedQuantity),
          reason: values.reason,
        })
        message = `Estoque de ${ingredient.name} ajustado`
      }
      await load()
    })
    if (saved) {
      setDialog(null)
      setToast(message)
    }
  }

  const belowMin = ingredients?.filter((item) => item.active && item.belowMin) ?? []

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO</span>
          <h1>Insumos</h1>
          <p>Estoque, custo e alertas. O envio à cozinha dá baixa sozinho pela ficha técnica de cada item.</p>
        </div>
        <button className="primary-btn" disabled={busy} onClick={() => open('form', null, EMPTY_FORM)}>
          + Novo insumo
        </button>
      </div>

      {error && !dialog && <div className="alert error">{error}</div>}
      {belowMin.length > 0 && (
        <div className="alert warning">
          {belowMin.length} insumo(s) abaixo do estoque mínimo: {belowMin.map((item) => item.name).join(', ')}.
        </div>
      )}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Estoque</h2>
            <p>{ingredients ? `${ingredients.length} insumo(s)` : 'Carregando...'}</p>
          </div>
        </div>
        <div className="ingredient-list">
          {ingredients?.map((item) => (
            <article
              key={item.id}
              className={`ingredient-card ${item.belowMin && item.active ? 'below-min' : ''} ${item.active ? '' : 'inactive'}`}
              aria-label={item.name}
            >
              <div className="ingredient-head">
                <b>{item.name}</b>
                {!item.active ? (
                  <span className="badge">Inativo</span>
                ) : (
                  item.belowMin && <span className="badge alert-badge">Abaixo do mínimo</span>
                )}
              </div>
              <strong className="ingredient-stock">{formatQuantity(item.stockQuantity, item.unit)}</strong>
              <small>
                Mínimo {formatQuantity(item.minStock, item.unit)} · {formatMoney(item.unitCost)}/{UNIT_LABELS[item.unit]}
              </small>
              <div className="item-controls">
                <button
                  className="outline-btn"
                  disabled={busy}
                  onClick={() => open('purchase', item, { quantity: '', unitCost: String(item.unitCost) })}
                >
                  Entrada
                </button>
                <button
                  className="outline-btn"
                  disabled={busy}
                  onClick={() => open('adjustment', item, { countedQuantity: '', reason: '' })}
                >
                  Ajuste
                </button>
                <button
                  className="outline-btn"
                  disabled={busy}
                  onClick={() =>
                    open('form', item, {
                      name: item.name,
                      unit: item.unit,
                      minStock: String(item.minStock),
                      unitCost: String(item.unitCost),
                      active: item.active,
                    })
                  }
                >
                  Editar
                </button>
              </div>
            </article>
          ))}
        </div>
        {ingredients?.length === 0 && <div className="empty-state">Nenhum insumo cadastrado.</div>}
      </section>

      {dialog && (
        <IngredientDialog dialog={dialog} busy={busy} error={error} onChange={setValue} onSubmit={submit} onClose={close} />
      )}
      <Toast message={toast} onDone={() => setToast('')} />
    </>
  )
}

function IngredientDialog({ dialog, busy, error, onChange, onSubmit, onClose }) {
  const { kind, ingredient, values } = dialog
  const unit = UNIT_LABELS[ingredient?.unit ?? values.unit]
  const titles = {
    form: ingredient ? `Editar: ${ingredient.name}` : 'Novo insumo',
    purchase: `Entrada: ${ingredient?.name}`,
    adjustment: `Ajuste: ${ingredient?.name}`,
  }
  const descriptions = {
    form: ingredient ? 'A unidade não muda depois do cadastro.' : 'O estoque começa em zero: registre uma entrada depois.',
    purchase: `Estoque atual: ${ingredient && formatQuantity(ingredient.stockQuantity, ingredient.unit)}. O custo do insumo passa a ser o desta compra.`,
    adjustment: `Estoque no sistema: ${ingredient && formatQuantity(ingredient.stockQuantity, ingredient.unit)}. Informe o que foi contado; a diferença fica registrada.`,
  }

  return (
    <Modal title={titles[kind]} description={descriptions[kind]} busy={busy} onClose={onClose}>
      <form className="modal-form" onSubmit={onSubmit}>
        {error && <div className="alert error">{error}</div>}
        {kind === 'form' && (
          <>
            <label>
              Nome
              <input value={values.name} onChange={onChange('name')} maxLength={100} required autoFocus />
            </label>
            <label>
              Unidade
              <select value={values.unit} onChange={onChange('unit')} disabled={Boolean(ingredient)}>
                <option value="kg">Quilo (kg)</option>
                <option value="l">Litro (L)</option>
                <option value="un">Unidade (un)</option>
              </select>
            </label>
            <label>
              Estoque mínimo ({unit})
              <input type="number" min="0" step="0.001" value={values.minStock} onChange={onChange('minStock')} placeholder="0" />
            </label>
            <label>
              Custo por {unit} (R$)
              <input type="number" min="0" step="0.01" value={values.unitCost} onChange={onChange('unitCost')} placeholder="0,00" />
            </label>
            {ingredient && (
              <label className="checkbox-label">
                <input type="checkbox" checked={values.active} onChange={onChange('active')} />
                Ativo (pode entrar em fichas técnicas)
              </label>
            )}
          </>
        )}
        {kind === 'purchase' && (
          <>
            <label>
              Quantidade comprada ({unit})
              <input type="number" min="0.001" step="0.001" value={values.quantity} onChange={onChange('quantity')} required autoFocus />
            </label>
            <label>
              Custo por {unit} (R$)
              <input type="number" min="0" step="0.01" value={values.unitCost} onChange={onChange('unitCost')} required />
            </label>
          </>
        )}
        {kind === 'adjustment' && (
          <>
            <label>
              Quantidade contada ({unit})
              <input
                type="number"
                min="0"
                step="0.001"
                value={values.countedQuantity}
                onChange={onChange('countedQuantity')}
                required
                autoFocus
              />
            </label>
            <label>
              Motivo
              <textarea value={values.reason} onChange={onChange('reason')} rows="2" required placeholder="Ex.: perda na câmara fria" />
            </label>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="outline-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="primary-btn" disabled={busy}>
            {kind === 'form' ? (ingredient ? 'Salvar alterações' : 'Cadastrar insumo') : kind === 'purchase' ? 'Registrar entrada' : 'Registrar ajuste'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
