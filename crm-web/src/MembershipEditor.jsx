import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MEMBERSHIP_SECTIONS, resizeMembershipUnits } from './lib/dataAdapters'

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 })

function createDraft(membership) {
  const seatCount = Math.min(20, Math.max(1, Number(membership?.seatCount || membership?.units?.length || 1)))
  return {
    membershipSection: membership?.membershipSection || '',
    localityCode: membership?.localityCode || '',
    discountCode: membership?.discountCode || '',
    seatCount,
    units: resizeMembershipUnits(membership?.units, seatCount),
  }
}

function validate(draft, pricingCatalog) {
  const errors = {}
  if (!MEMBERSHIP_SECTIONS.includes(draft.membershipSection)) errors.membershipSection = 'Selecciona VIP, Preferente o General.'
  const locality = pricingCatalog?.localities?.find((item) => item.code === draft.localityCode)
  if (!locality || locality.section !== draft.membershipSection) errors.localityCode = 'Selecciona una localidad de esta sección.'
  if (!pricingCatalog?.discounts?.some((item) => item.code === draft.discountCode)) errors.discountCode = 'Selecciona una opción de descuento.'
  const seatCount = Number(draft.seatCount)
  if (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 20) errors.seatCount = 'Selecciona entre 1 y 20 abonos.'
  const identifiers = resizeMembershipUnits(draft.units, seatCount).map((unit) => String(unit.seatIdentifier || '').trim())
  identifiers.forEach((identifier, index) => {
    if (!identifier) errors[`seat-${index}`] = `Captura la butaca ${index + 1}.`
  })
  const repeated = new Map()
  identifiers.forEach((identifier, index) => {
    if (!identifier) return
    const key = identifier.toLocaleLowerCase('es-MX')
    repeated.set(key, [...(repeated.get(key) || []), index])
  })
  repeated.forEach((indexes) => {
    if (indexes.length > 1) indexes.forEach((index) => { errors[`seat-${index}`] = 'Cada butaca debe ser única.' })
  })
  return errors
}

function PricingSummary({ pricing }) {
  if (!pricing || pricing.netAmount == null) return null
  return (
    <div className="membership-pricing-summary" aria-label="Cotización de abonos">
      <div><span>Precio de lista</span><strong>{pricing.listUnitPrice == null ? '—' : mxn.format(pricing.listUnitPrice)}</strong></div>
      <div><span>Valor comercial</span><strong>{mxn.format(pricing.commercialValue)}</strong></div>
      <div><span>Descuento</span><strong>{mxn.format(pricing.discountAmount || 0)}</strong></div>
      <div className="membership-pricing-net"><span>Importe neto</span><strong>{mxn.format(pricing.netAmount)}</strong></div>
      {pricing.pricingMode === 'two_for_one' && <small>{pricing.chargedUnits} cobrados + {pricing.bonusUnits || 0} de bonificación en la cotización 2×1.</small>}
    </div>
  )
}

function ReadOnlyMembership({ membership }) {
  if (!membership) return <div className="manual-inline-note"><strong>Sin abonos capturados</strong><span>No existe una membresía para la temporada actual.</span></div>
  const seats = membership.units?.map((unit) => unit.seatIdentifier).filter(Boolean) || []
  return (
    <>
      <div className="membership-readonly">
        <div><span>Sección</span><strong>{membership.membershipSection || 'Sin capturar'}</strong></div>
        <div><span>Localidad</span><strong>{membership.localityName || 'Sin cotizar'}</strong></div>
        <div><span>Cantidad</span><strong>{membership.seatCount} abonos</strong></div>
        <div><span>Descuento</span><strong>{membership.discountName || 'Sin cotizar'}</strong></div>
        <div className="membership-readonly-seats"><span>Butacas</span><strong>{seats.length ? seats.join(', ') : 'Sin capturar'}</strong></div>
      </div>
      <PricingSummary pricing={membership}/>
    </>
  )
}

export default function MembershipEditor({ membership, pricingCatalog, onQuote, canEdit, focusOnMount = false, onSave, onSavingChange = () => {} }) {
  const [draft, setDraft] = useState(() => createDraft(membership))
  const [errors, setErrors] = useState({})
  const [quote, setQuote] = useState(null)
  const [quotedSelectionKey, setQuotedSelectionKey] = useState('')
  const [quoteState, setQuoteState] = useState('idle')
  const [quoteError, setQuoteError] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const sectionRef = useRef(null)
  const editorRef = useRef(null)
  const savingRef = useRef(false)
  const quoteRequest = useRef(0)
  const exceedsLimit = Number(membership?.seatCount || 0) > 20
  const mayEdit = canEdit && !exceedsLimit
  const membershipKey = `${membership?.id || 'new'}:${membership?.rowVersion || 0}`
  const localities = useMemo(() => (pricingCatalog?.localities || []).filter((item) => item.section === draft.membershipSection), [pricingCatalog, draft.membershipSection])
  const selectionKey = `${draft.localityCode}|${draft.discountCode}|${draft.seatCount}`

  useEffect(() => {
    setDraft(createDraft(membership))
    setErrors({})
    setQuote(null)
    setQuotedSelectionKey('')
    setQuoteState('idle')
    setSubmitError('')
  }, [membershipKey])

  useEffect(() => {
    if (focusOnMount && mayEdit) sectionRef.current?.focus()
  }, [focusOnMount, mayEdit])

  useEffect(() => {
    const valid = mayEdit && localities.some((item) => item.code === draft.localityCode) && pricingCatalog?.discounts?.some((item) => item.code === draft.discountCode) && Number.isInteger(Number(draft.seatCount))
    quoteRequest.current += 1
    const requestId = quoteRequest.current
    setQuote(null)
    setQuotedSelectionKey('')
    setQuoteError('')
    if (!valid || !onQuote) {
      setQuoteState('idle')
      return undefined
    }
    setQuoteState('loading')
    const timeout = window.setTimeout(async () => {
      try {
        const result = await onQuote({ localityCode: draft.localityCode, discountCode: draft.discountCode, seatCount: Number(draft.seatCount) })
        if (requestId !== quoteRequest.current) return
        setQuote(result)
        setQuotedSelectionKey(`${draft.localityCode}|${draft.discountCode}|${draft.seatCount}`)
        setQuoteState('ready')
      } catch (error) {
        if (requestId !== quoteRequest.current) return
        setQuoteState('error')
        setQuoteError(error?.message || 'No fue posible cotizar estos abonos.')
      }
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [draft.localityCode, draft.discountCode, draft.seatCount, localities, mayEdit, onQuote, pricingCatalog])

  const identifiers = useMemo(() => draft.units.map((unit) => String(unit.seatIdentifier || '').trim()).filter(Boolean), [draft.units])

  function updateSection(value) {
    setDraft((current) => ({ ...current, membershipSection: value, localityCode: pricingCatalog?.localities?.some((item) => item.code === current.localityCode && item.section === value) ? current.localityCode : '' }))
    setErrors((current) => ({ ...current, membershipSection: '', localityCode: '' }))
    setSubmitError('')
  }

  function updateSeatCount(value) {
    const count = Number(value)
    if (count < draft.seatCount && draft.units.slice(count).some((unit) => String(unit.seatIdentifier || '').trim())) {
      const confirmed = window.confirm('Al reducir la cantidad se eliminarán las butacas sobrantes. ¿Deseas continuar?')
      if (!confirmed) return
    }
    setDraft((current) => ({ ...current, seatCount: count, units: resizeMembershipUnits(current.units, count) }))
    setErrors({})
    setSubmitError('')
  }

  function updateSeat(index, value) {
    setDraft((current) => ({ ...current, units: current.units.map((unit, unitIndex) => unitIndex === index ? { ...unit, seatIdentifier: value } : unit) }))
    setErrors((current) => ({ ...current, [`seat-${index}`]: '' }))
    setSubmitError('')
  }

  async function save() {
    if (savingRef.current) return
    const found = validate(draft, pricingCatalog)
    if (quoteState !== 'ready' || !quote || quotedSelectionKey !== selectionKey) found.quote = 'Espera una cotización válida antes de guardar.'
    setErrors(found)
    if (Object.keys(found).length) {
      window.setTimeout(() => editorRef.current?.querySelector('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    savingRef.current = true
    setSaving(true)
    onSavingChange(true)
    setSubmitError('')
    try {
      await onSave({ membershipSection: draft.membershipSection, localityCode: draft.localityCode, discountCode: draft.discountCode, seatCount: Number(draft.seatCount), units: resizeMembershipUnits(draft.units, draft.seatCount) })
    } catch (error) {
      setSubmitError(error?.message || 'No fue posible guardar los abonos. Conservamos la captura para que puedas reintentar.')
    } finally {
      savingRef.current = false
      setSaving(false)
      onSavingChange(false)
    }
  }

  return (
    <section ref={editorRef} className="membership-editor" aria-labelledby="membership-editor-title" aria-busy={saving}>
      <h3 id="membership-editor-title">Abonos de LMP 2026–2027</h3>
      {exceedsLimit ? <><div className="notice notice--important"><div><strong>Revisión requerida</strong><p>Esta membresía supera el límite de 20 abonos de la captura manual.</p></div></div><ReadOnlyMembership membership={membership}/></> : !mayEdit ? <ReadOnlyMembership membership={membership} /> : (
        <>
          <div className="form-grid membership-fields">
            <label className="field"><span>Sección *</span><select ref={sectionRef} disabled={saving} value={draft.membershipSection} onChange={(event) => updateSection(event.target.value)} aria-invalid={Boolean(errors.membershipSection)}><option value="">Selecciona una sección</option>{MEMBERSHIP_SECTIONS.map((section) => <option key={section}>{section}</option>)}</select>{errors.membershipSection && <small className="field-error">{errors.membershipSection}</small>}</label>
            <label className="field"><span>Localidad *</span><select disabled={saving || !draft.membershipSection} value={draft.localityCode} onChange={(event) => { setDraft((current) => ({ ...current, localityCode: event.target.value })); setErrors((current) => ({ ...current, localityCode: '' })) }} aria-invalid={Boolean(errors.localityCode)}><option value="">Selecciona una localidad</option>{localities.map((item) => <option key={item.code} value={item.code}>{item.displayName}</option>)}</select>{errors.localityCode && <small className="field-error">{errors.localityCode}</small>}</label>
            <label className="field"><span>Descuento o campaña *</span><select disabled={saving} value={draft.discountCode} onChange={(event) => { setDraft((current) => ({ ...current, discountCode: event.target.value })); setErrors((current) => ({ ...current, discountCode: '' })) }} aria-invalid={Boolean(errors.discountCode)}><option value="">Selecciona conscientemente</option>{(pricingCatalog?.discounts || []).map((item) => <option key={item.code} value={item.code}>{item.displayName}</option>)}</select>{errors.discountCode && <small className="field-error">{errors.discountCode}</small>}</label>
            <label className="field"><span>Cantidad de abonos *</span><select disabled={saving} value={draft.seatCount} onChange={(event) => updateSeatCount(event.target.value)} aria-invalid={Boolean(errors.seatCount)}>{Array.from({ length: 20 }, (_, index) => index + 1).map((value) => <option key={value}>{value}</option>)}</select><small>Genera una captura por cada butaca.</small>{errors.seatCount && <small className="field-error">{errors.seatCount}</small>}</label>
          </div>
          <div className="membership-quote" aria-live="polite">{quoteState === 'loading' ? <span>Cotizando con el servidor…</span> : quoteState === 'error' ? <span className="field-error" role="alert">{quoteError}</span> : <PricingSummary pricing={quote}/>}</div>
          {errors.quote && <p className="form-error" role="alert">{errors.quote}</p>}
          <div className="membership-seat-grid" aria-label="Butacas individuales">
            {draft.units.map((unit, index) => <label className="field" key={unit.unitNumber}><span>Butaca {index + 1} *</span><input disabled={saving} value={unit.seatIdentifier} onChange={(event) => updateSeat(index, event.target.value)} maxLength="100" autoComplete="off" placeholder="Ej. Fila A · 12" aria-invalid={Boolean(errors[`seat-${index}`])}/>{errors[`seat-${index}`] && <small className="field-error">{errors[`seat-${index}`]}</small>}</label>)}
          </div>
          <div className="membership-editor-footer"><span aria-live="polite">{identifiers.length} de {draft.seatCount} butacas capturadas</span><button type="button" className="button button--secondary" disabled={saving || quoteState !== 'ready' || quotedSelectionKey !== selectionKey} onClick={save}>{saving ? 'Guardando abonos…' : membership ? 'Guardar abonos' : 'Agregar abonos'}</button></div>
          {submitError && <p className="form-error membership-submit-error" role="alert">{submitError}</p>}
          <small className="membership-history-note">La cotización del servidor se confirma al guardar; la zona histórica permanece sin cambios.</small>
        </>
      )}
    </section>
  )
}
