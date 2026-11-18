import { useEffect, useState } from 'react'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import { formatMoney } from '../utils/format'

const EMPTY_FORM = { id: null, name: '', category: '', price: '', available: true }

export default function MenuAdmin() {
  const [items, setItems] = useState(null)
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const { busy, error, run } = useAction()

  async function load() {
    const [all, usedCategories] = await Promise.all([
      api.get('/menu-items?all=true'),
      api.get('/menu-items/categories'),
    ])
    setItems(all)
    setCategories(usedCategories)
  }

  useEffect(() => {
    run(load)
  }, [])

  const editing = form.id !== null
  const setField = (field) => (event) =>
    setForm({ ...form, [field]: field === 'available' ? event.target.checked : event.target.value })

  async function save(event) {
    event.preventDefault()
    const body = {
      name: form.name,
      category: form.category,
      price: Number(form.price),
      available: form.available,
    }
    const saved = await run(async () => {
      if (editing) await api.patch(`/menu-items/${form.id}`, body)
      else await api.post('/menu-items', body)
      await load()
    })
    if (saved) setForm(EMPTY_FORM)
  }

  // Item nunca é apagado: sai de linha com available = false (RN-09).
  const toggleAvailable = (item) =>
    run(async () => {
      const updated = await api.patch(`/menu-items/${item.id}`, { available: !item.available })
      setForm((current) => (current.id === item.id ? { ...current, available: updated.available } : current))
      await load()
    })

  const byCategory = Object.entries(
    (items ?? []).reduce((groups, item) => {
      ;(groups[item.category] ??= []).push(item)
      return groups
    }, {}),
  )

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO</span>
          <h1>Cardápio</h1>
          <p>Cadastre itens, ajuste preços e tire produtos de linha. Pedidos já lançados mantêm o preço antigo.</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="order-layout">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Itens cadastrados</h2>
              <p>{items ? `${items.length} item(ns)` : 'Carregando...'}</p>
            </div>
          </div>

          {byCategory.map(([category, categoryItems]) => (
            <div key={category}>
              <h3 className="subheading">{category}</h3>
              <div className="menu-list">
                {categoryItems.map((item) => (
                  <div className={`menu-item ${item.available ? '' : 'unavailable'}`} key={item.id}>
                    <div>
                      <b>{item.name}</b>
                      <small>{item.available ? 'Disponível' : 'Fora de linha'}</small>
                      <strong>{formatMoney(item.price)}</strong>
                    </div>
                    <div className="item-controls">
                      <button className="outline-btn" disabled={busy} onClick={() => setForm({ ...item, price: String(item.price) })}>
                        Editar
                      </button>
                      <button className="outline-btn" disabled={busy} onClick={() => toggleAvailable(item)}>
                        {item.available ? 'Tirar de linha' : 'Reativar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {items?.length === 0 && <div className="empty-state">Nenhum item cadastrado.</div>}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{editing ? `Editar: ${form.name}` : 'Novo item'}</h2>
              <p>Nome, categoria e preço são obrigatórios.</p>
            </div>
          </div>

          <form className="payment-form" onSubmit={save}>
            <label>
              Nome
              <input value={form.name} onChange={setField('name')} maxLength={100} required />
            </label>
            <label>
              Categoria
              <input value={form.category} onChange={setField('category')} list="menu-categories" maxLength={50} required />
              <datalist id="menu-categories">
                {categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </label>
            <label>
              Preço (R$)
              <input type="number" min="0" step="0.01" value={form.price} onChange={setField('price')} required />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.available} onChange={setField('available')} />
              Disponível para novos pedidos
            </label>
            <div className="button-row">
              {editing && (
                <button type="button" className="outline-btn" onClick={() => setForm(EMPTY_FORM)}>
                  Cancelar edição
                </button>
              )}
              <button className="primary-btn" disabled={busy}>
                {editing ? 'Salvar alterações' : 'Cadastrar item'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  )
}
