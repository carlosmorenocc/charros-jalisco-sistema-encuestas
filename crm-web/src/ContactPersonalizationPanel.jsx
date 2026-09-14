import React, { useMemo, useState } from 'react'

const JERSEY_SIZES = ['S', 'M', 'L', 'XL', '2XL']

function splitPersonalization(value = '') {
  const match = String(value).trim().match(/^(.*?)(?:\s*-\s*(\d{2}))?$/)
  return { name: (match?.[1] || '').trim().toLocaleUpperCase('es-MX').slice(0, 10), number: match?.[2] || '' }
}

export default function ContactPersonalizationPanel({ orders = [], canEdit, onSave }) {
  const seats = useMemo(() => orders.flatMap((order) => (order.seatDetails || []).map((seat) => ({ ...seat, orderNumber: order.orderNumber, segment: order.segment || order.zone || '' }))), [orders])
  const [drafts, setDrafts] = useState(() => Object.fromEntries(seats.map((seat) => [seat.id, { ...splitPersonalization(seat.personalization), jerseySize: seat.jerseySize || '', rowVersion: seat.rowVersion }])))
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')

  function update(id, field, value) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [field]: value } }))
    setError('')
  }

  async function save(seat) {
    const draft = drafts[seat.id] || {}
    const name = String(draft.name || '').trim().toLocaleUpperCase('es-MX')
    if (name && !/^[\p{L} ]{1,10}$/u.test(name)) { setError('El nombre admite de 1 a 10 letras y espacios.'); return }
    if (draft.number && !/^(0[1-9]|[1-9][0-9])$/.test(draft.number)) { setError('El número debe estar entre 01 y 99.'); return }
    if (draft.number && !name) { setError('Captura el nombre antes del número.'); return }
    setSavingId(seat.id)
    try {
      const saved = await onSave(seat, { personalizationName: name || null, personalizationNumber: draft.number || null, jerseySize: draft.jerseySize || null, rowVersion: draft.rowVersion })
      setDrafts((current) => ({ ...current, [seat.id]: { ...current[seat.id], rowVersion: saved?.rowVersion ?? draft.rowVersion } }))
    } catch (saveError) {
      setError(saveError?.message || 'No fue posible guardar la personalización.')
    } finally { setSavingId('') }
  }

  if (!orders.length) return <div className="manual-inline-note"><strong>Aún no tiene una orden asignada</strong><span>La personalización estará disponible cuando el contacto tenga una orden asociada.</span></div>
  if (!seats.length) return <div className="manual-inline-note"><strong>Sin butacas asociadas</strong><span>La orden existe, pero todavía no cuenta con un desglose individual de butacas.</span></div>

  return <div className="contact-personalization">
    <p>Completa únicamente los datos operativos de cada butaca. La compra y sus importes permanecen ligados a la orden.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {orders.map((order) => <details key={order.saleId} defaultOpen={orders.length === 1}>
      <summary>Orden {order.orderNumber} · {order.quantity} {Number(order.quantity) === 1 ? 'butaca' : 'butacas'}</summary>
      <div className="personalization-seat-list">
        {(order.seatDetails || []).map((seat) => {
          const draft = drafts[seat.id] || { name: '', number: '', jerseySize: '' }
          const jerseyEligible = ['VIP', 'Preferente'].includes(order.segment)
          return <article key={seat.id}>
            <header><strong>Butaca {seat.unitNumber}</strong><span>{seat.seatIdentifier || 'Sin ubicación capturada'}</span></header>
            <div className="personalization-fields">
              <label className="field"><span>Nombre para butaca (1 a 10 caracteres)</span><input disabled={!canEdit || savingId === seat.id} maxLength="10" value={draft.name} onChange={(event) => update(seat.id, 'name', event.target.value.toLocaleUpperCase('es-MX').replace(/[^\p{L} ]/gu, ''))} placeholder="MARTÍNEZ" /></label>
              <label className="field"><span>Número (entre 01 y 99)</span><input disabled={!canEdit || savingId === seat.id} inputMode="numeric" maxLength="2" value={draft.number} onChange={(event) => update(seat.id, 'number', event.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="22" /></label>
              {jerseyEligible && <label className="field"><span>Talla de jersey</span><select disabled={!canEdit || savingId === seat.id} value={draft.jerseySize} onChange={(event) => update(seat.id, 'jerseySize', event.target.value)}><option value="">Sin definir</option>{JERSEY_SIZES.map((size) => <option key={size}>{size}</option>)}</select></label>}
              {canEdit && <button type="button" className="button button--secondary" disabled={savingId === seat.id} onClick={() => save(seat)}>{savingId === seat.id ? 'Guardando…' : 'Guardar butaca'}</button>}
            </div>
          </article>
        })}
      </div>
    </details>)}
  </div>
}
