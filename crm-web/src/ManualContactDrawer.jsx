import React, { useEffect, useMemo, useRef, useState } from 'react'
import { hasPermission, PERMISSIONS } from './lib/permissions'
import { ACTIVE_SEASON, classificationHasMembership, duplicateContactId, JERSEY_SIZES, resizeJerseySizes } from './lib/manualEntry'

const STEPS = ['Datos personales', 'Clasificación y abonos', 'Gestión y seguimiento']
const SOURCES = [
  ['season_ticket_database', 'Base de abonados'],
  ['referral', 'Referido'],
  ['box_office', 'Taquilla'],
  ['digital', 'Registro digital'],
  ['event', 'Evento o activación'],
  ['outbound', 'Prospección del equipo'],
  ['other', 'Otro origen'],
]

function localInputDate(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function localInputDateTime(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function isValidMexicanPhone(value) {
  let digits = String(value || '').replace(/\D+/g, '')
  if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2)
  if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3)
  return digits.length === 10
}

function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const values = globalThis.crypto?.getRandomValues?.(new Uint8Array(16)) || Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
  values[6] = (values[6] & 0x0f) | 0x40
  values[8] = (values[8] & 0x3f) | 0x80
  const hex = [...values].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function initialDraft(kind, user) {
  const subscriberStatus = kind === 'prospect' ? 'prospect' : 'renewing'
  return {
    firstName: '', lastName: '', email: '', phone: '', municipality: '',
    subscriberStatus, commercialStage: 'to_contact', declaredTenureSeasons: '',
    seasonCode: ACTIVE_SEASON, seatCount: 1, jerseySizes: [''], zone: '', product: '',
    startDate: '', renewalDate: '', preferredChannel: '', executiveId: '',
    businessSource: '', consentStatus: 'unknown', consentEvidenceConfirmed: false,
    initialObservation: '', scheduleTask: false, taskAssignedTo: user.id,
    taskDueAt: localInputDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000)), taskPriority: 'normal', taskDescription: '',
  }
}

function membershipLabel(status) {
  return ({ current_subscriber: 'activo', new_subscriber: 'activo', renewing: 'por renovar', former_subscriber: 'vencido' })[status] || ''
}

function validateStep(draft, step) {
  const errors = {}
  if (step === 0) {
    if (!draft.firstName.trim()) errors.firstName = 'Captura el nombre.'
    if (!draft.lastName.trim()) errors.lastName = 'Captura los apellidos.'
    if (!draft.email.trim() && !draft.phone.trim()) errors.contactMethod = 'Captura al menos correo o teléfono.'
    if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) errors.email = 'Revisa el formato del correo.'
    if (draft.phone.trim() && !isValidMexicanPhone(draft.phone)) errors.phone = 'Captura 10 dígitos; también se acepta el prefijo +52.'
  }
  if (step === 1) {
    const tenure = draft.declaredTenureSeasons
    if (tenure !== '' && (!Number.isInteger(Number(tenure)) || Number(tenure) < (draft.subscriberStatus === 'prospect' ? 0 : 1) || Number(tenure) > 100)) {
      errors.declaredTenureSeasons = draft.subscriberStatus === 'prospect' ? 'Usa un valor entre 0 y 100.' : 'Para un abonado informado, usa un valor entre 1 y 100.'
    }
    if (classificationHasMembership(draft.subscriberStatus)) {
      const seats = Number(draft.seatCount)
      if (!Number.isInteger(seats) || seats < 1 || seats > 20) errors.seatCount = 'Selecciona entre 1 y 20 abonos.'
      if (['current_subscriber', 'new_subscriber'].includes(draft.subscriberStatus) && !draft.startDate) errors.startDate = 'Captura la fecha de inicio del abono activo.'
      if (draft.subscriberStatus === 'renewing' && !draft.renewalDate) errors.renewalDate = 'Captura la fecha prevista de renovación.'
    }
  }
  if (step === 2) {
    if (!draft.businessSource) errors.businessSource = 'Selecciona el origen comercial.'
    if (!draft.initialObservation.trim()) errors.initialObservation = 'Captura una observación inicial.'
    if (draft.initialObservation.trim().length > 4000) errors.initialObservation = 'La observación no puede superar 4,000 caracteres.'
    if (draft.consentStatus !== 'unknown' && !draft.consentEvidenceConfirmed) errors.consentEvidenceConfirmed = 'Confirma que cuentas con evidencia del consentimiento bajo el aviso vigente.'
    if (draft.scheduleTask) {
      if (!draft.taskAssignedTo) errors.taskAssignedTo = 'Selecciona un responsable.'
      if (!draft.taskDescription.trim()) errors.taskDescription = 'Describe el siguiente paso.'
      const dueAt = new Date(draft.taskDueAt).getTime()
      if (!Number.isFinite(dueAt) || dueAt <= Date.now()) errors.taskDueAt = 'Programa una fecha y hora futura.'
    }
  }
  return errors
}

function FieldError({ id, children }) {
  return children ? <small id={id} className="field-error">{children}</small> : null
}

export default function ManualContactDrawer({ kind, user, executiveOptions, onClose, onSave, onOpenExisting }) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState(() => initialDraft(kind, user))
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const attemptRef = useRef({ fingerprint: '', key: '' })
  const headingRef = useRef(null)
  const errorRef = useRef(null)
  const mayAssignContact = hasPermission(user, PERMISSIONS.CONTACT_ASSIGN)
  const mayAssignTask = hasPermission(user, PERMISSIONS.TASK_WRITE_ALL)
  const mayCreateTask = hasPermission(user, PERMISSIONS.TASK_WRITE_ALL) || hasPermission(user, PERMISSIONS.TASK_WRITE_ASSIGNED)
  const hasMembership = classificationHasMembership(draft.subscriberStatus)
  const contactExecutives = useMemo(() => executiveOptions.filter((item) => item.active !== false), [executiveOptions])
  const taskAssignees = useMemo(() => {
    const options = [{ id: user.id, displayName: `${user.name} (Administrador)` }]
    const assignedExecutive = contactExecutives.find((item) => item.id === draft.executiveId)
    if (assignedExecutive && assignedExecutive.id !== user.id) options.push(assignedExecutive)
    return options
  }, [contactExecutives, draft.executiveId, user.id, user.name])

  useEffect(() => { headingRef.current?.focus() }, [step])
  useEffect(() => {
    function handleKeyDown(event) { if (event.key === 'Escape' && !savingRef.current) onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: '', ...(field === 'email' || field === 'phone' ? { contactMethod: '' } : {}) }))
    setSubmitError(null)
  }

  function updateSeatCount(value) {
    const count = Number(value)
    setDraft((current) => ({ ...current, seatCount: count, jerseySizes: resizeJerseySizes(current.jerseySizes, count) }))
    setErrors((current) => ({ ...current, seatCount: '' }))
    setSubmitError(null)
  }

  function next() {
    const found = validateStep(draft, step)
    setErrors(found)
    if (Object.keys(found).length) {
      window.setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    setStep((current) => Math.min(2, current + 1))
  }

  async function submit(event) {
    event.preventDefault()
    if (savingRef.current) return
    const found = validateStep(draft, 2)
    setErrors(found)
    if (Object.keys(found).length) {
      window.setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    const fingerprint = JSON.stringify(draft)
    if (attemptRef.current.fingerprint !== fingerprint) attemptRef.current = { fingerprint, key: createIdempotencyKey() }
    savingRef.current = true
    setSaving(true)
    setSubmitError(null)
    try {
      await onSave(draft, attemptRef.current.key)
    } catch (error) {
      const contactId = duplicateContactId(error)
      const isDuplicate = error?.status === 409 && error?.code === 'DUPLICATE_CONTACT'
      setSubmitError({
        message: isDuplicate
          ? contactId ? 'Ya existe un contacto activo que coincide con estos datos.' : 'Encontramos una o más coincidencias. Busca el correo o teléfono en la cartera antes de continuar; un administrador puede revisar registros eliminados.'
          : error?.message || 'No fue posible crear el registro. Conservamos tus datos para que puedas reintentar.',
        contactId,
      })
      window.setTimeout(() => errorRef.current?.focus(), 0)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingRef.current) onClose() }}>
      <aside className="drawer drawer--manual" role="dialog" aria-modal="true" aria-labelledby="manual-drawer-title" aria-busy={saving}>
        <header className="drawer-header"><div><span className="eyebrow">Alta manual · {ACTIVE_SEASON.replace('LMP-', 'LMP ')}</span><h2 id="manual-drawer-title" ref={headingRef} tabIndex="-1">Nuevo registro</h2><p>Captura una persona a la vez. La importación de archivos no forma parte de esta etapa.</p></div><button type="button" className="icon-button manual-close" aria-label="Cerrar alta manual" disabled={saving} onClick={onClose}>×</button></header>
        <ol className="manual-steps" aria-label="Progreso del alta">{STEPS.map((label, index) => <li key={label} className={index === step ? 'manual-step--active' : index < step ? 'manual-step--done' : ''} aria-current={index === step ? 'step' : undefined}><span>{index + 1}</span><small>{label}</small></li>)}</ol>
        <form onSubmit={submit} noValidate>
          <div className="drawer-body manual-body">
            {submitError && <div ref={errorRef} tabIndex="-1" className="manual-submit-error" role="alert"><strong>No se completó el alta</strong><p>{submitError.message}</p>{submitError.contactId && <button type="button" className="text-button" onClick={() => onOpenExisting(submitError.contactId)}>Revisar contacto existente</button>}</div>}

            {step === 0 && <fieldset><legend>Datos personales</legend><p className="section-help">Nombre y al menos un medio de contacto son obligatorios.</p><div className="form-grid">
              <label className="field"><span>Nombre(s) *</span><input autoFocus maxLength="100" value={draft.firstName} onChange={(event) => update('firstName', event.target.value)} aria-invalid={Boolean(errors.firstName)} aria-describedby="manual-first-name-error"/><FieldError id="manual-first-name-error">{errors.firstName}</FieldError></label>
              <label className="field"><span>Apellidos *</span><input maxLength="140" value={draft.lastName} onChange={(event) => update('lastName', event.target.value)} aria-invalid={Boolean(errors.lastName)} aria-describedby="manual-last-name-error"/><FieldError id="manual-last-name-error">{errors.lastName}</FieldError></label>
              <label className="field"><span>Correo</span><input type="email" inputMode="email" maxLength="254" placeholder="persona@correo.com" value={draft.email} onChange={(event) => update('email', event.target.value)} aria-invalid={Boolean(errors.email || errors.contactMethod)} aria-describedby="manual-email-error"/><FieldError id="manual-email-error">{errors.email || errors.contactMethod}</FieldError></label>
              <label className="field"><span>Teléfono</span><input type="tel" inputMode="tel" maxLength="30" placeholder="33 0000 0000" value={draft.phone} onChange={(event) => update('phone', event.target.value)} aria-invalid={Boolean(errors.phone || errors.contactMethod)} aria-describedby="manual-phone-error"/><FieldError id="manual-phone-error">{errors.phone || (!draft.email.trim() ? errors.contactMethod : '')}</FieldError></label>
              <label className="field field--full"><span>Municipio</span><input maxLength="120" value={draft.municipality} onChange={(event) => update('municipality', event.target.value)} placeholder="Municipio de residencia"/></label>
            </div></fieldset>}

            {step === 1 && <><fieldset><legend>Clasificación comercial</legend><div className="form-grid">
              <label className="field"><span>Clasificación *</span><select autoFocus value={draft.subscriberStatus} onChange={(event) => update('subscriberStatus', event.target.value)}><option value="prospect">Prospecto</option><option value="renewing">Por renovar</option><option value="former_subscriber">Exabonado</option></select><small>Abonado actual y Abonado nuevo se asignan automáticamente al registrar su orden en Ventas.</small></label>
              <label className="field"><span>Etapa comercial *</span><select value={draft.commercialStage} onChange={(event) => update('commercialStage', event.target.value)}><option value="to_contact">Por contactar</option><option value="contacted">Contactado</option><option value="follow_up">Seguimiento</option><option value="interested">Interesado</option><option value="reserved">Apartado</option><option value="won">Ganado</option><option value="lost">Perdido</option></select></label>
              <label className="field"><span>Temporadas como abonado (declaradas)</span><select value={draft.declaredTenureSeasons} onChange={(event) => update('declaredTenureSeasons', event.target.value)} aria-invalid={Boolean(errors.declaredTenureSeasons)} aria-describedby="manual-tenure-help"><option value="">No consta</option>{Array.from({ length: 100 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}</select><small id="manual-tenure-help">Dato declarado; no sustituye temporadas verificadas.</small><FieldError>{errors.declaredTenureSeasons}</FieldError></label>
              <div className="field"><span>Temporada del registro</span><output className="derived-value">LMP 2026–2027</output><small>Definida por la campaña activa.</small></div>
            </div></fieldset>
            <fieldset><legend>Abonos de la temporada</legend>{!hasMembership ? <div className="manual-inline-note"><strong>Prospecto sin abono</strong><span>El registro se crea sin membresía. Podrás agregarla cuando avance la relación.</span></div> : <><div className="manual-membership-summary"><span>Se registrará un abono <strong>{membershipLabel(draft.subscriberStatus)}</strong> en LMP 2026–2027.</span></div><div className="form-grid">
              <label className="field"><span>Cantidad de abonos *</span><select value={draft.seatCount} onChange={(event) => updateSeatCount(event.target.value)} aria-invalid={Boolean(errors.seatCount)}>{Array.from({ length: 20 }, (_, index) => index + 1).map((value) => <option key={value}>{value}</option>)}</select><FieldError>{errors.seatCount}</FieldError></label>
              <label className="field"><span>Zona</span><input maxLength="120" value={draft.zone} onChange={(event) => update('zone', event.target.value)} placeholder="Opcional; aplica a todos"/></label>
              <label className="field"><span>Producto o plan</span><input maxLength="160" value={draft.product} onChange={(event) => update('product', event.target.value)} placeholder="Opcional; aplica a todos"/></label>
              {['current_subscriber', 'new_subscriber'].includes(draft.subscriberStatus) && <label className="field"><span>Inicio del abono *</span><input type="date" max={localInputDate(new Date())} value={draft.startDate} onChange={(event) => update('startDate', event.target.value)} aria-invalid={Boolean(errors.startDate)}/><FieldError>{errors.startDate}</FieldError></label>}
              {draft.subscriberStatus === 'renewing' && <label className="field"><span>Fecha objetivo de renovación *</span><input type="date" value={draft.renewalDate} onChange={(event) => update('renewalDate', event.target.value)} aria-invalid={Boolean(errors.renewalDate)}/><FieldError>{errors.renewalDate}</FieldError></label>}
            </div><div className="jersey-grid" aria-label="Tallas por abono">{draft.jerseySizes.map((size, index) => <label className="field" key={index}><span>Talla de jersey · Abono {index + 1}</span><select value={size} onChange={(event) => setDraft((current) => ({ ...current, jerseySizes: current.jerseySizes.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))}><option value="">Sin definir</option>{JERSEY_SIZES.map((option) => <option key={option}>{option}</option>)}</select><small>Opcional; puede completarse después.</small></label>)}</div></>}</fieldset></>}

            {step === 2 && <><fieldset><legend>Gestión inicial</legend><div className="form-grid">
              <label className="field"><span>Canal preferido</span><select autoFocus value={draft.preferredChannel} onChange={(event) => update('preferredChannel', event.target.value)}><option value="">Sin definir</option><option value="phone">Llamada</option><option value="whatsapp">WhatsApp</option><option value="email">Correo</option><option value="in_person">Presencial</option><option value="other">Otro</option></select></label>
              <label className="field"><span>Ejecutivo</span>{mayAssignContact ? <select value={draft.executiveId} onChange={(event) => { update('executiveId', event.target.value); update('taskAssignedTo', user.id) }}><option value="">Sin asignar</option>{contactExecutives.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select> : <output className="derived-value">{user.name}</output>}<small>{mayAssignContact ? 'Puedes asignar ahora o dejarlo pendiente.' : 'Se asignará automáticamente a tu cartera.'}</small></label>
              <label className="field"><span>Origen comercial *</span><select value={draft.businessSource} onChange={(event) => update('businessSource', event.target.value)} aria-invalid={Boolean(errors.businessSource)}><option value="">Selecciona un origen</option>{SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>La procedencia técnica se registra como alta manual.</small><FieldError>{errors.businessSource}</FieldError></label>
              <label className="field"><span>Consentimiento de contacto</span><select value={draft.consentStatus} onChange={(event) => { update('consentStatus', event.target.value); update('consentEvidenceConfirmed', false) }}><option value="unknown">No consta</option><option value="yes">Sí</option><option value="no">No</option></select><small>Si no cuentas con evidencia, conserva “No consta”.</small></label>
              {draft.consentStatus !== 'unknown' && <label className="check-field field--full"><input type="checkbox" checked={draft.consentEvidenceConfirmed} onChange={(event) => update('consentEvidenceConfirmed', event.target.checked)} aria-invalid={Boolean(errors.consentEvidenceConfirmed)}/><span>Confirmo que existe evidencia de esta decisión bajo el aviso de privacidad vigente.</span><FieldError>{errors.consentEvidenceConfirmed}</FieldError></label>}
              <label className="field field--full"><span>Observación inicial *</span><textarea rows="4" maxLength="4000" value={draft.initialObservation} onChange={(event) => update('initialObservation', event.target.value)} aria-invalid={Boolean(errors.initialObservation)} placeholder="Contexto verificable para iniciar el seguimiento."/><small>{draft.initialObservation.length}/4,000 · Esta nota no cuenta como contacto humano.</small><FieldError>{errors.initialObservation}</FieldError></label>
            </div></fieldset>
            {mayCreateTask && <fieldset><legend>Próximo seguimiento opcional</legend><label className="check-field"><input type="checkbox" checked={draft.scheduleTask} onChange={(event) => update('scheduleTask', event.target.checked)}/><span>Programar una tarea al crear el registro</span></label>{draft.scheduleTask && <div className="form-grid manual-task-fields">
              <label className="field"><span>Responsable *</span>{mayAssignTask ? <select value={draft.taskAssignedTo} onChange={(event) => update('taskAssignedTo', event.target.value)} aria-invalid={Boolean(errors.taskAssignedTo)}>{taskAssignees.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select> : <output className="derived-value">{user.name}</output>}<small>Puede ser el administrador o el ejecutivo asignado al contacto.</small><FieldError>{errors.taskAssignedTo}</FieldError></label>
              <label className="field"><span>Fecha y hora *</span><input type="datetime-local" min={localInputDateTime(new Date())} value={draft.taskDueAt} onChange={(event) => update('taskDueAt', event.target.value)} aria-invalid={Boolean(errors.taskDueAt)}/><FieldError>{errors.taskDueAt}</FieldError></label>
              <label className="field"><span>Prioridad</span><select value={draft.taskPriority} onChange={(event) => update('taskPriority', event.target.value)}><option value="low">Baja</option><option value="normal">Media</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
              <label className="field field--full"><span>Descripción *</span><textarea rows="3" maxLength="2000" value={draft.taskDescription} onChange={(event) => update('taskDescription', event.target.value)} aria-invalid={Boolean(errors.taskDescription)} placeholder="Siguiente paso concreto."/><FieldError>{errors.taskDescription}</FieldError></label>
            </div>}</fieldset>}</>}
          </div>
          <footer className="drawer-footer manual-footer"><span>Paso {step + 1} de {STEPS.length}</span><div><button type="button" className="button button--secondary" disabled={saving} onClick={step === 0 ? onClose : () => { setErrors({}); setStep((current) => current - 1) }}>{step === 0 ? 'Cancelar' : 'Atrás'}</button>{step < 2 ? <button type="button" className="button button--primary" onClick={next}>Continuar</button> : <button type="submit" className="button button--primary" disabled={saving}>{saving ? 'Creando registro…' : 'Crear registro'}</button>}</div></footer>
        </form>
      </aside>
    </div>
  )
}
