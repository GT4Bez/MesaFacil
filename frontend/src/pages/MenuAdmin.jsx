import { useEffect, useState } from 'react'
import { useAction } from '../hooks/useAction'
import { api } from '../services/api'
import Modal from '../components/Modal'
import Toast from '../components/Toast'
import { formatMoney } from '../utils/format'

const EMPTY_FORM = { id: null, name: '', category: '', price: '', available: true }

// Spec 012: novo/editar em modal; a lista ocupa a largura toda.

export default function MenuAdmin() {
  const [items, setItems] = useState(null)
  const [categories, setCategories] = useState([])
  // null = modal fechado; com objeto = modal aberto (novo quando id é null).
  const [form, setForm] = useState(null)
  const [toast, setToast] = useState('')
  const { busy, error, clearError, run } = useAction()

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

  const editing = form?.id != null
  function openForm(initial) {
    clearError()
    setForm(initial)
  }
  function closeForm() {
    clearError()
    setForm(null)
  }
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
    if (saved) {
      setToast(editing ? `${form.name}: alterações salvas` : `${form.name} cadastrado no cardápio`)
      setForm(null)
    }
  }

  // Item nunca é apagado: sai de linha com available = false (RN-09).
  const toggleAvailable = (item) =>
    run(async () => {
      await api.patch(`/menu-items/${item.id}`, { available: !item.available })
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
        <button className="primary-btn" disabled={busy} onClick={() => openForm(EMPTY_FORM)}>
          + Novo item
        </button>
      </div>

      {error && !form && <div className="alert error">{error}</div>}

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
            <div className="menu-list admin-list">
              {categoryItems.map((item) => (
                <div className={`menu-item ${item.available ? '' : 'unavailable'}`} key={item.id}>
                  <div>
                    <b>{item.name}</b>
                    <small>{item.available ? 'Disponível' : 'Fora de linha'}</small>
                    <strong>{formatMoney(item.price)}</strong>
                  </div>
                  <div className="item-controls">
                    <button className="outline-btn" disabled={busy} onClick={() => openForm({ ...item, price: String(item.price) })}>
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

      {form && (
        <Modal
          title={editing ? `Editar: ${form.name}` : 'Novo item'}
          description="Nome, categoria e preço são obrigatórios."
          busy={busy}
          onClose={closeForm}
        >
          <form className="modal-form" onSubmit={save}>
            {error && <div className="alert error">{error}</div>}
            <label>
              Nome
              <input value={form.name} onChange={setField('name')} maxLength={100} required autoFocus />
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
            <div className="modal-actions">
              <button type="button" className="outline-btn" onClick={closeForm} disabled={busy}>
                Cancelar
              </button>
              <button className="primary-btn" disabled={busy}>
                {editing ? 'Salvar alterações' : 'Cadastrar item'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      <Toast message={toast} onDone={() => setToast('')} />
    </>
  )
}
