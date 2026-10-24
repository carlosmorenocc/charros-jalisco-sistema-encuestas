import React, { useMemo, useRef, useState } from 'react'
import { REWARD_MILESTONES, rewardDemoCut, rewardDemoHolders } from './demoData'
import './rewards-program.css'

const statusMeta = {
  delivered: ['✓', 'Entregado'], pending: ['!', 'Cupón pendiente'], 'on-track': ['→', 'En progreso'], locked: ['·', 'Por alcanzar'],
}

function seatLabel(seat) {
  return `${seat.zone} · ${seat.section} · ${seat.seat}`
}

function rewardStatus(seat, milestone) {
  if (seat.visits < milestone.visits) return 'locked'
  if (milestone.visits === 2 && seat.rewardState === 'delivered') return 'delivered'
  return 'pending'
}

export default function RewardsProgram({
  holders = rewardDemoHolders,
  cut = rewardDemoCut,
  actor = { name: 'OPERADOR DE RECOMPENSAS', role: 'Operador' },
  onOpenHolder,
  onDeliver,
  onLogout,
  embedded = false,
}) {
  const [filters, setFilters] = useState({ query: '', zone: 'all', visits: 'all', reward: 'all' })
  const [selectedHolderId, setSelectedHolderId] = useState(null)
  const [selectedSeatId, setSelectedSeatId] = useState(null)
  const [delivery, setDelivery] = useState(null)
  const [delivered, setDelivered] = useState(new Set())
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [loadedHolder, setLoadedHolder] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [importStep, setImportStep] = useState(1)
  const [importType, setImportType] = useState('access')
  const [fileName, setFileName] = useState('')
  const searchRef = useRef(null)

  const rows = useMemo(() => holders.map((holder) => ({
    ...holder,
    visits: Math.max(...holder.seats.map((seat) => seat.visits)),
    seatCount: holder.seats.length,
    rewardState: holder.seats.some((seat) => seat.rewardState === 'pending') ? 'pending' : holder.seats.some((seat) => seat.rewardState === 'delivered') ? 'delivered' : 'on-track',
  })).filter((holder) => {
    const needle = filters.query.trim().toLocaleUpperCase('es-MX')
    const text = `${holder.name} ${holder.order} ${holder.seats.map(seatLabel).join(' ')}`.toLocaleUpperCase('es-MX')
    if (needle && !text.includes(needle)) return false
    if (filters.zone !== 'all' && holder.zone !== filters.zone) return false
    if (filters.visits !== 'all' && holder.visits !== Number(filters.visits)) return false
    if (filters.reward !== 'all' && holder.rewardState !== filters.reward) return false
    return true
  }), [filters, holders])

  const baseHolder = holders.find((item) => item.id === selectedHolderId)
  const holder = loadedHolder?.id === selectedHolderId ? loadedHolder : baseHolder
  const seat = holder?.seats.find((item) => item.id === selectedSeatId) || holder?.seats[0]

  async function openHolder(id) {
    const next = holders.find((item) => item.id === id)
    setSelectedHolderId(id)
    setSelectedSeatId(next?.seats[0]?.id ?? null)
    setLoadedHolder(null)
    setError('')
    if (onOpenHolder && next) {
      setProfileLoading(true)
      try {
        const detailed = await onOpenHolder(next)
        setLoadedHolder(detailed)
        setSelectedSeatId(detailed?.seats[0]?.id ?? null)
      } catch (loadError) {
        setError(loadError?.message || 'No fue posible cargar el perfil.')
      } finally {
        setProfileLoading(false)
      }
    }
  }

  async function confirmDelivery() {
    setError('')
    try {
      const persistedReward = seat.rewards?.find((reward) => Number(reward.milestone_visits) === Number(delivery.visits))
      if (onDeliver) await onDeliver({ seatId: seat.id, rewardId: persistedReward?.id || delivery.id })
      setDelivered((current) => new Set([...current, `${seat.id}:${delivery.id}`]))
      setDelivery(null)
      setToast(`Cupón registrado · ${seat.section} ${seat.seat}`)
      window.setTimeout(() => setToast(''), 3200)
    } catch (saveError) {
      setError(saveError?.message || 'No fue posible registrar la entrega. La selección se conservó.')
    }
  }

  return (
    <div className={`rp-shell ${embedded ? 'rp-shell--embedded' : ''}`}>
      <a className="rp-skip" href="#rewards-content">Saltar al contenido</a>
      {!embedded && <header className="rp-header">
        <div className="rp-brand">
          <img src="/club-charros-recompensas.png" alt="Club Charros · Experiencias y Recompensas" />
          <div><strong>Programa de Recompensas</strong><span>LMP 2026–2027</span></div>
        </div>
        <nav aria-label="Programa de recompensas"><button className="is-active">Operación</button><button onClick={() => setShowImport(true)}>Importaciones</button></nav>
        <div className="rp-user"><span aria-hidden="true">★</span><div><strong>{actor.name}</strong><small>{actor.role}</small></div>{onLogout && <button onClick={onLogout}>Cerrar sesión</button>}</div>
      </header>}

      <main id="rewards-content" className="rp-main">
        <section className="rp-hero">
          <div><p className="rp-eyebrow">Operación de partido</p><h1>Cada juego cuenta</h1><p>Consulta asistencias por butaca y registra la entrega exacta de cada recompensa.</p></div>
          <button className="rp-gold-button" onClick={() => setShowImport(true)}><span aria-hidden="true">↑</span> Cargar reporte Excel</button>
        </section>

        <section className="rp-cut" aria-label="Corte de asistencia">
          <div className="rp-cut-main"><span className="rp-live" aria-hidden="true">●</span><div><small>Partido correspondiente</small><strong>{cut.game}</strong><span>{cut.timestamp}</span></div></div>
          <span className="rp-status rp-status--partial"><b aria-hidden="true">◷</b>{cut.status}</span>
          <div className="rp-cut-stat"><strong>{cut.scanned}</strong><span>accesos únicos</span></div>
        </section>

        <section className="rp-summary" aria-label="Resumen del programa">
          {[[cut.programs, 'Programas activos', '◎'], [cut.scanned, 'Asistencias al corte', '✓'], [cut.pendingRewards, 'Cupones por preparar', '★'], [cut.reviewCases, 'Casos por revisar', '!']].map(([value, label, icon]) => <article key={label}><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></article>)}
        </section>

        <section className="rp-workspace">
          <div className="rp-search-row">
            <label className="rp-search"><span aria-hidden="true">⌕</span><input ref={searchRef} value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Buscar por nombre, orden o ubicación…" aria-label="Buscar por nombre, orden o ubicación" /></label>
            <label><span>Zona</span><select value={filters.zone} onChange={(event) => setFilters({ ...filters, zone: event.target.value })}><option value="all">Todas</option><option>VIP</option><option>Preferente</option><option>General</option></select></label>
            <label><span>Visitas</span><select value={filters.visits} onChange={(event) => setFilters({ ...filters, visits: event.target.value })}><option value="all">Cualquiera</option>{[0,1,2,3,4].map(value => <option key={value} value={value}>{value} exactas</option>)}</select></label>
            <label><span>Recompensa</span><select value={filters.reward} onChange={(event) => setFilters({ ...filters, reward: event.target.value })}><option value="all">Todos los estados</option><option value="pending">Cupón pendiente</option><option value="delivered">Entregado</option><option value="on-track">En progreso</option></select></label>
          </div>
          <div className="rp-table-heading"><div><p className="rp-eyebrow">Padrón elegible</p><h2>Abonados y butacas</h2></div><span>{rows.length} titulares encontrados</span></div>
          <div className="rp-table-wrap"><table><thead><tr><th>Titular / orden</th><th>Ubicación</th><th>Butacas</th><th>Visitas</th><th>Recompensas</th><th><span className="sr-only">Acción</span></th></tr></thead><tbody>
            {rows.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><span>Orden {item.order}</span></td><td><strong>{item.seats[0].zone}</strong><span>Sección {item.seats[0].section}</span></td><td>{item.seatCount}</td><td><span className="rp-visit-count">{item.visits}</span></td><td><span className={`rp-status rp-status--${item.rewardState}`}><b aria-hidden="true">{statusMeta[item.rewardState][0]}</b>{statusMeta[item.rewardState][1]}</span></td><td><button className="rp-link" onClick={() => openHolder(item.id)}>Abrir perfil <span aria-hidden="true">→</span></button></td></tr>)}
            {!rows.length && <tr><td colSpan="6"><div className="rp-empty"><span aria-hidden="true">⌕</span><strong>Sin coincidencias</strong><p>Ajusta los filtros o verifica la orden y ubicación.</p><button onClick={() => { setFilters({ query: '', zone: 'all', visits: 'all', reward: 'all' }); searchRef.current?.focus() }}>Limpiar filtros</button></div></td></tr>}
          </tbody></table></div>
        </section>
      </main>

      {holder && <div className="rp-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedHolderId(null) }}><aside className="rp-profile" role="dialog" aria-modal="true" aria-labelledby="rp-profile-title">
        <header><div><p className="rp-eyebrow">Perfil de abonado</p><h2 id="rp-profile-title">{holder.name}</h2><span>Orden {holder.order} · {holder.seats.length} butacas independientes</span></div><button className="rp-icon-button" onClick={() => setSelectedHolderId(null)} aria-label="Cerrar perfil">×</button></header>
        <div className="rp-seat-tabs" role="tablist" aria-label="Seleccionar butaca">{holder.seats.map((item) => <button role="tab" aria-selected={item.id === seat.id} key={item.id} onClick={() => setSelectedSeatId(item.id)}><span>{item.section} · {item.seat}</span><strong>{item.visits} visitas</strong></button>)}</div>
        {profileLoading && <p className="rp-profile-loading" role="status">Cargando historial de las butacas…</p>}
        <section className="rp-seat-hero"><div><small>Programa individual</small><h3>{seat.zone}</h3><p>Sección {seat.section} · Asiento {seat.seat}</p></div><div className="rp-ring"><strong>{seat.visits}</strong><span>visitas</span></div></section>
        <section className="rp-rewards"><div className="rp-section-title"><div><p className="rp-eyebrow">Ruta de recompensas</p><h3>Hitos de esta butaca</h3></div><span>Desliza para consultar los 15 hitos →</span></div><div className="rp-reward-rail">{REWARD_MILESTONES.map((milestone) => { const state = delivered.has(`${seat.id}:${milestone.id}`) ? 'delivered' : rewardStatus(seat, milestone); return <article className={`rp-reward-card is-${state}`} key={milestone.id}><div className="rp-milestone"><span>VISITA</span><strong>{String(milestone.visits).padStart(2, '0')}</strong></div><h4>{milestone.benefit}</h4><span className={`rp-status rp-status--${state}`}><b aria-hidden="true">{statusMeta[state][0]}</b>{statusMeta[state][1]}</span>{state === 'pending' && <button onClick={() => setDelivery(milestone)}>Registrar cupón entregado</button>}</article> })}</div></section>
        <section className="rp-history"><div className="rp-section-title"><div><p className="rp-eyebrow">Evidencia importada</p><h3>Historial de partidos</h3></div></div><div className="rp-history-grid">{seat.history.map((game) => <article key={game.date} className={game.attended ? 'is-attended' : ''}><span>{game.attended ? '✓' : '—'}</span><div><strong>{game.date}</strong><p>{game.game}</p><small>{game.evidence}</small></div></article>)}</div></section>
      </aside></div>}

      {delivery && <div className="rp-overlay rp-overlay--modal"><section className="rp-confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><span className="rp-confirm-icon">★</span><h2 id="confirm-title">Confirmar entrega de cupón</h2><p>Se registrará una entrega trazable para:</p><dl><div><dt>Butaca</dt><dd>{seatLabel(seat)}</dd></div><div><dt>Premio</dt><dd>Visita {delivery.visits} · {delivery.benefit}</dd></div></dl>{error && <p className="rp-error" role="alert">! {error}</p>}<div><button onClick={() => { setDelivery(null); setError('') }}>Cancelar</button><button className="rp-primary" onClick={confirmDelivery}>Confirmar entrega</button></div></section></div>}

      {showImport && <div className="rp-overlay"><aside className="rp-import" role="dialog" aria-modal="true" aria-labelledby="import-title"><header><div><p className="rp-eyebrow">Carga controlada</p><h2 id="import-title">Importar reporte Excel</h2><p>Previsualiza y confirma antes de afectar asistencias.</p></div><button className="rp-icon-button" onClick={() => setShowImport(false)} aria-label="Cerrar importación">×</button></header><ol className="rp-steps"><li className={importStep >= 1 ? 'is-active' : ''}><b>1</b>Archivo</li><li className={importStep >= 2 ? 'is-active' : ''}><b>2</b>Revisión</li><li className={importStep >= 3 ? 'is-active' : ''}><b>3</b>Confirmación</li></ol>
        {importStep === 1 && <div className="rp-import-body"><label className="rp-import-type"><span>Tipo de reporte</span><select value={importType} onChange={(event) => setImportType(event.target.value)}><option value="access">Historial de accesos</option><option value="sales">Órdenes detalladas / padrón</option></select></label><label className="rp-dropzone"><input type="file" accept=".xlsx" onChange={(event) => setFileName(event.target.files?.[0]?.name || '')} /><span aria-hidden="true">⇧</span><strong>{fileName || 'Selecciona un archivo .xlsx'}</strong><small>Máximo 25 MB · no se usa el nombre para determinar el partido</small></label><button className="rp-primary" disabled={!fileName} onClick={() => setImportStep(2)}>Revisar archivo</button></div>}
        {importStep === 2 && <div className="rp-import-body"><div className="rp-import-warning"><span>◷</span><div><strong>Confirma el partido y el tipo de corte</strong><p>El evento ligado identifica el producto de abono; no sustituye esta confirmación.</p></div></div><label className="rp-import-type"><span>Partido</span><select><option>22 oct 2026 · Águilas de Mexicali vs Charros · J3</option></select></label><div className="rp-radio-row"><label><input type="radio" name="cut" defaultChecked /> Reporte parcial</label><label><input type="radio" name="cut" /> Reporte cerrado</label></div><div className="rp-preview-grid">{[[429,'Incluidos'],[5211,'Excluidos'],[616,'Coincidencias'],[17,'Duplicados'],[8,'Por revisar']].map(([value,label]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div><div className="rp-import-actions"><button onClick={() => setImportStep(1)}>Atrás</button><button className="rp-primary" onClick={() => setImportStep(3)}>Confirmar importación</button></div></div>}
        {importStep === 3 && <div className="rp-import-body rp-import-success"><span>✓</span><h3>Importación sintética completada</h3><p>429 asistencias únicas incorporadas. Los parciales previos permanecen y ningún reingreso duplicó el contador.</p><button className="rp-primary" onClick={() => { setShowImport(false); setImportStep(1); setFileName('') }}>Volver a operación</button></div>}
      </aside></div>}

      {toast && <div className="rp-toast" role="status"><span>✓</span>{toast}</div>}
    </div>
  )
}
