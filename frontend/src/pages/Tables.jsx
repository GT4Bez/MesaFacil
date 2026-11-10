import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, patch } from '../services/api';

export default function Tables() {
  const [tables, setTables] = useState([]);
  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      setError('');
      const [tableData, shiftData] = await Promise.all([get('/tables'), get('/shifts/active')]);
      setTables(Array.isArray(tableData) ? tableData : tableData.tables || []);
      setShift(shiftData?.shift || shiftData || null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shiftOpen = !!(shift && (shift.status === 'open' || shift.status === 'active' || shift.isOpen === true));
  const isManager = ['gerente','manager','admin'].some(r => String(JSON.parse(localStorage.getItem('mesa-facil-user') || '{}').role || '').toLowerCase().includes(r));

  async function changeShift() {
    setBusy(true); setError('');
    try {
      if (shiftOpen) await patch(`/shifts/${shift.id}/close`);
      else await post('/shifts', {});
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function startOrder(table) {
    if (!shiftOpen) return;
    setBusy(true); setError('');
    try {
      const result = await post('/orders', { tableId: table.id });
      const orderId = result.id || result.order?.id;
      if (!orderId) throw new Error('O backend não retornou o ID da comanda.');
      await load(); navigate(`/orders/${orderId}`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const occupied = tables.filter(t => t.status === 'occupied').length;

  return <><div className="page-heading"><div><span className="eyebrow">VISÃO GERAL</span><h1>Salão e mesas</h1><p>Acompanhe a ocupação e inicie novos atendimentos.</p></div><button className="outline-btn" onClick={load}>↻ Atualizar</button></div>
    <section className={`shift-banner ${shiftOpen ? 'shift-open' : 'shift-closed'}`}><div><span className="shift-icon">◷</span><div><b>Turno {shiftOpen ? 'aberto' : 'fechado'}</b><p>{shiftOpen ? 'O salão está liberado para novos atendimentos.' : 'O atendimento está bloqueado até a abertura do turno.'}</p></div></div>{isManager && <button className={shiftOpen ? 'dark-btn' : 'primary-btn'} disabled={busy} onClick={changeShift}>{busy ? 'Aguarde...' : shiftOpen ? 'Encerrar turno' : 'Abrir turno'}</button>}</section>
    {error && <div className="alert error">{error}</div>}
    {!shiftOpen && <div className="alert warning">Turno fechado: não é possível iniciar novos atendimentos. Solicite ao gerente a abertura do turno.</div>}
    <div className="stats-grid"><div className="stat-card"><small>Total de mesas</small><strong>{tables.length || 10}</strong><span>no restaurante</span></div><div className="stat-card"><small>Mesas disponíveis</small><strong className="green-text">{tables.filter(t=>t.status==='available').length}</strong><span>prontas para atender</span></div><div className="stat-card"><small>Mesas ocupadas</small><strong className="red-text">{occupied}</strong><span>em atendimento</span></div></div>
    <div className="section-heading"><div><h2>Mapa de mesas</h2><p>Selecione uma mesa para acessar ou iniciar uma comanda.</p></div><div className="legend"><span><i className="dot available"/> Livre</span><span><i className="dot occupied"/> Ocupada</span></div></div>
    {loading ? <div className="empty-state">Carregando mesas...</div> : <div className="table-grid">{(tables.length ? tables : Array.from({length:10},(_,i)=>({id:i+1,number:i+1,status:'available'}))).map((table,i) => {
      const isOccupied = table.status === 'occupied';
      return <button key={table.id} className={`table-card ${isOccupied ? 'occupied' : 'available'}`} disabled={busy || (!isOccupied && !shiftOpen)} onClick={()=>isOccupied ? table.activeOrderId && navigate(`/orders/${table.activeOrderId}`) : startOrder(table)}>
        <span className="table-top"><span>MESA</span><span className="table-status">{isOccupied ? 'Ocupada' : 'Livre'}</span></span><strong>{table.number ?? table.name ?? i+1}</strong><small>{isOccupied ? 'Ver comanda →' : 'Iniciar atendimento +'}</small>
      </button>;
    })}</div>}</>;
}
