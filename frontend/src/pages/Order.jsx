import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { get, post, patch, del } from '../services/api';

const money = n => Number(n || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export default function Order() {
  const { id } = useParams(); const navigate = useNavigate();
  const [order,setOrder] = useState(null); const [menu,setMenu] = useState([]);
  const [category,setCategory] = useState('Todos'); const [qty,setQty] = useState(1); const [note,setNote] = useState('');
  const [selected,setSelected] = useState(null); const [loading,setLoading] = useState(true); const [error,setError] = useState(''); const [busy,setBusy] = useState(false);

  const load = useCallback(async()=>{
    try { setError(''); const [o,m] = await Promise.all([get(`/orders/${id}`),get('/menu-items')]); setOrder(o.order||o); setMenu(Array.isArray(m)?m:m.items||m.menuItems||[]); }
    catch(e){setError(e.message);} finally{setLoading(false);}
  },[id]);
  useEffect(()=>{load();},[load]);
  const items = order?.items || order?.orderItems || [];
  const categories = ['Todos',...new Set(menu.map(x=>x.category?.name||x.category||'Outros'))];
  const filtered = category==='Todos'?menu:menu.filter(x=>(x.category?.name||x.category||'Outros')===category);
  const subtotal = useMemo(()=>items.reduce((s,x)=>s+Number(x.unitPrice??x.price??x.menuItem?.price??0)*Number(x.quantity||1),0),[items]);

  async function action(fn){setBusy(true);setError('');try{await fn();await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function addItem(){if(!selected)return;await action(()=>post(`/orders/${id}/items`,{menuItemId:selected.id,quantity:Number(qty),observation:note}));setSelected(null);setQty(1);setNote('');}
  async function updateQty(item,value){await action(()=>patch(`/order-items/${item.id}/quantity`,{quantity:Number(value)}));}
  async function removeItem(item){await action(()=>del(`/order-items/${item.id}`));}
  async function sendKitchen(){await action(()=>patch(`/orders/${id}/send-to-kitchen`));}
  async function readyToPay(){await action(()=>patch(`/orders/${id}/ready-to-pay`));}
  const locked = ['closed','ready_to_pay','ready-to-pay'].includes(order?.status);

  if(loading)return <div className="empty-state">Carregando comanda...</div>;
  return <><div className="page-heading"><div><span className="eyebrow">ATENDIMENTO</span><h1>Comanda da mesa {order?.table?.number || order?.tableNumber || '—'}</h1><p>Pedido #{id} · Aberto em {order?.createdAt ? new Date(order.createdAt).toLocaleString('pt-BR') : '—'} · Status: {order?.status || 'ativo'}</p></div><button className="outline-btn" onClick={()=>navigate('/tables')}>← Voltar às mesas</button></div>
    {error&&<div className="alert error">{error}</div>}
    <div className="order-layout"><section className="panel"><div className="panel-heading"><div><h2>Cardápio</h2><p>Escolha os produtos para adicionar à comanda.</p></div></div><div className="category-row">{categories.map(c=><button key={c} className={category===c?'category active':'category'} onClick={()=>setCategory(c)}>{c}</button>)}</div>
      <div className="menu-list">{filtered.map(item=><div className="menu-item" key={item.id}><div><b>{item.name}</b><small>{item.description||item.category?.name||'Item do cardápio'}</small><strong>{money(item.price)}</strong></div><button className="add-btn" onClick={()=>setSelected(item)}>+</button></div>)}</div>
      {selected&&<div className="add-form"><b>Adicionar: {selected.name}</b><div className="form-row"><label>Quantidade<input type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)}/></label><label className="grow">Observação<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Ex.: sem cebola, bem passado"/></label></div><div className="button-row"><button className="outline-btn" onClick={()=>setSelected(null)}>Cancelar</button><button className="primary-btn" disabled={busy||Number(qty)<1} onClick={addItem}>Adicionar à comanda</button></div></div>}
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>Itens da comanda</h2><p>{items.length} item(ns) lançado(s)</p></div></div><div className="order-items">{items.map(item=>{const pending=item.status==='pending';return <div className="order-item" key={item.id}><div className="order-item-main"><b>{item.menuItem?.name||item.name||'Produto'}</b><small>{item.observation||'Sem observações'}</small><span className={`item-status ${item.status||'pending'}`}>{item.status||'pending'}</span></div><div className="item-controls">{pending?<><input aria-label="Quantidade" type="number" min="1" defaultValue={item.quantity} onBlur={e=>{if(Number(e.target.value)>0&&Number(e.target.value)!==item.quantity)updateQty(item,e.target.value)}}/><button className="remove-btn" onClick={()=>removeItem(item)}>×</button></>:<span>Qtd. {item.quantity}</span>}</div><strong>{money((item.unitPrice??item.price??item.menuItem?.price??0)*item.quantity)}</strong></div>})}{!items.length&&<div className="empty-state">Nenhum item adicionado ainda.</div>}</div>
      <div className="subtotal-row"><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div className="stack-buttons"><button className="primary-btn full" disabled={busy||!items.some(x=>x.status==='pending')} onClick={sendKitchen}>Enviar para a cozinha →</button><button className="outline-btn full" disabled={busy||!items.length||locked} onClick={readyToPay}>Pedir a conta</button></div>
    </section></div></>;
}
