import { useEffect, useState } from 'react'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import Modal from './Modal'
import { formatMoney, UNIT_LABELS } from '../utils/format'

const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places

// RN-15 (spec 009): ficha técnica do item do cardápio. A estimativa na tela é só para orientar;
// o backend recalcula custo e margem pelo custo atual de cada insumo (não há custo gravado na ficha).
export default function RecipeModal({ item, onSaved, onClose }) {
  const [ingredients, setIngredients] = useState([])
  const [rows, setRows] = useState(null)
  const [saved, setSaved] = useState(null)
  // Carregar e salvar têm estados separados: durante o carregamento o modal continua fechável.
  const loader = useAction()
  const { busy, error, run } = useAction()

  useEffect(() => {
    loader.run(async () => {
      const [recipe, all] = await Promise.all([api.get(`/menu-items/${item.id}/recipe`), api.get('/ingredients')])
      setIngredients(all)
      setSaved(recipe)
      setRows(recipe.items.map((row) => ({ ingredientId: row.ingredientId, quantity: String(row.quantity) })))
    })
  }, [item.id])

  const byId = Object.fromEntries(ingredients.map((ingredient) => [ingredient.id, ingredient]))
  const estimate = round(
    (rows ?? []).reduce((sum, row) => sum + (Number(row.quantity) || 0) * (byId[row.ingredientId]?.unitCost ?? 0), 0),
    2,
  )
  const margin = round(item.price - estimate, 2)
  const usedIds = new Set((rows ?? []).map((row) => row.ingredientId))
  const available = ingredients.filter((ingredient) => ingredient.active && !usedIds.has(ingredient.id))

  const updateRow = (index, field) => (event) =>
    setRows(rows.map((row, current) => (current === index ? { ...row, [field]: event.target.value } : row)))
  const removeRow = (index) => setRows(rows.filter((_, current) => current !== index))
  const addRow = () => setRows([...rows, { ingredientId: available[0]?.id ?? '', quantity: '' }])

  async function handleSubmit(event) {
    event.preventDefault()
    let result = null
    const ok = await run(async () => {
      result = await api.put(`/menu-items/${item.id}/recipe`, {
        items: rows.map((row) => ({ ingredientId: row.ingredientId, quantity: Number(row.quantity) })),
      })
    })
    if (ok) onSaved(result)
  }

  return (
    <Modal
      title={`Ficha técnica: ${item.name}`}
      description="Quanto de cada insumo uma unidade do item consome. O envio à cozinha dá baixa por esta ficha."
      busy={busy}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        {(error || loader.error) && <div className="alert error">{error || loader.error}</div>}
        {rows === null ? (
          !loader.error && <div className="empty-state">Carregando ficha...</div>
        ) : (
          <>
            {rows.length === 0 && <div className="empty-state">Item sem ficha: vende normalmente, sem baixa de estoque.</div>}
            {rows.map((row, index) => {
              const ingredient = byId[row.ingredientId]
              return (
                <div className={`recipe-row ${ingredient && !ingredient.active ? 'inactive-row' : ''}`} key={index}>
                  <label>
                    Insumo
                    <select value={row.ingredientId} onChange={updateRow(index, 'ingredientId')} required>
                      {ingredient ? null : <option value="">Escolha</option>}
                      {ingredients
                        .filter((option) => option.id === row.ingredientId || (option.active && !usedIds.has(option.id)))
                        .map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                            {option.active ? '' : ' (inativo)'}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Quantidade ({ingredient ? UNIT_LABELS[ingredient.unit] : '—'})
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={row.quantity}
                      onChange={updateRow(index, 'quantity')}
                      required
                    />
                  </label>
                  <button
                    type="button"
                    className="remove-btn"
                    aria-label={`Remover ${ingredient?.name ?? 'linha'}`}
                    onClick={() => removeRow(index)}
                  >
                    ×
                  </button>
                  {ingredient && !ingredient.active && (
                    <small className="recipe-warning">
                      {ingredient.name} está inativo: continua na ficha e dando baixa. Troque ou remova quando puder.
                    </small>
                  )}
                </div>
              )
            })}
            <button type="button" className="outline-btn" onClick={addRow} disabled={busy || available.length === 0}>
              + Adicionar insumo
            </button>
            <div className="recipe-summary" aria-live="polite">
              <div className="bill-line">
                <span>Preço de venda</span>
                <b>{formatMoney(item.price)}</b>
              </div>
              <div className="bill-line">
                <span>Custo estimado</span>
                <b>{formatMoney(estimate)}</b>
              </div>
              <div className="bill-line recipe-margin">
                <span>Margem</span>
                <b className={margin < 0 ? 'diff-negative' : 'diff-zero'}>
                  {formatMoney(margin)}
                  {item.price > 0 && ` (${round((margin / item.price) * 100, 1).toLocaleString('pt-BR')} %)`}
                </b>
              </div>
              {saved && saved.items.length > 0 && (
                <small className="muted">Custo atual calculado pelo sistema: {formatMoney(saved.cost)}.</small>
              )}
            </div>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="outline-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="primary-btn" disabled={busy || rows === null}>
            Salvar ficha
          </button>
        </div>
      </form>
    </Modal>
  )
}
