import React, { useEffect, useMemo, useRef, useState } from 'react'
import logo from '../rewards/assets/club-charros-recompensas.jpeg'
import baseStyles from '../rewards/RewardsRegistration.module.css'
import styles from './SoftballRegistration.module.css'
import { submitSoftballForm } from './submitSoftballForm'

const WHATSAPP_CHANNEL = 'https://whatsapp.com/channel/0029VbE1306LSmbVPqM1Ro02'
const SOFTBALL_EVENT_ID = 'softbol-club-charros-2026-11-08'
const SOFTBALL_MAX_SEASON_TICKETS = 20

function normalizeUppercase(value) {
  return value.toLocaleUpperCase('es-MX')
}

function normalizeMexicanPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 14 && digits.startsWith('0052')) return digits.slice(4)
  if (digits.length === 13 && digits.startsWith('521')) return digits.slice(3)
  if (digits.length === 12 && digits.startsWith('52')) return digits.slice(2)
  return digits
}

function validParticipantName(value) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  const parts = normalized.split(' ').filter((part) => /\p{L}/u.test(part))
  return normalized.length >= 5
    && normalized.length <= 140
    && parts.length >= 2
    && /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u.test(normalized)
}

function submissionErrorMessage(error) {
  if (error?.status === 409) {
    return 'Esta persona ya está registrada. Solo se permite un registro por persona.'
  }
  if (error?.status === 410) {
    return 'El periodo de registro cerró al finalizar el martes 3 de noviembre.'
  }
  if (error?.status === 400) {
    return 'Revisa la cantidad de abonos, el nombre, el teléfono y el evento seleccionado.'
  }
  if (error?.status === 429) {
    return 'Recibimos muchos registros al mismo tiempo. Espera un momento e inténtalo nuevamente.'
  }
  if (error?.status === 503) {
    return 'El registro está temporalmente pausado. Inténtalo nuevamente más tarde.'
  }
  if (Number.isInteger(error?.status)) {
    return 'No pudimos guardar tu registro. Inténtalo nuevamente en unos momentos.'
  }
  return 'No pudimos conectarnos para guardar tu registro. Revisa tu conexión e inténtalo nuevamente.'
}

function getShareUrl() {
  const configured = import.meta.env.VITE_SOFTBALL_PUBLIC_URL?.trim()
  if (configured) return configured
  if (typeof window !== 'undefined') return `${window.location.origin}/softbol-afiliados`
  return '/softbol-afiliados'
}

export default function SoftballRegistration() {
  const [step, setStep] = useState(1)
  const [data, setData] = useState({
    cantidadAbonos: '',
    nombreCompleto: '',
    telefono: '',
    eventoSeleccionado: ''
  })
  const [acceptsPrivacy, setAcceptsPrivacy] = useState(false)
  const [acceptsCommunications, setAcceptsCommunications] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const headingRef = useRef(null)
  const shareUrl = useMemo(getShareUrl, [])

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [step])

  function continueToPrivacy(event) {
    event.preventDefault()
    const seasonTicketQuantity = Number(data.cantidadAbonos)
    const fullName = data.nombreCompleto.trim()
    const phoneValue = data.telefono.trim()
    const phoneDigits = normalizeMexicanPhone(phoneValue)

    if (
      !Number.isInteger(seasonTicketQuantity)
      || seasonTicketQuantity < 1
      || seasonTicketQuantity > SOFTBALL_MAX_SEASON_TICKETS
    ) {
      setError('Selecciona cuántos abonos tienes.')
      return
    }
    if (!validParticipantName(fullName)) {
      setError('Escribe tu nombre completo.')
      return
    }
    if (!/^\+?[0-9() .-]+$/.test(phoneValue) || phoneDigits.length !== 10) {
      setError('Escribe un número de teléfono mexicano válido de 10 dígitos.')
      return
    }
    if (data.eventoSeleccionado !== SOFTBALL_EVENT_ID) {
      setError('Selecciona el juego de sóftbol para registrar tu participación.')
      return
    }

    setError('')
    setStep(2)
  }

  async function submit(event) {
    event.preventDefault()
    if (!acceptsPrivacy) {
      setError('Debes aceptar el Aviso de Privacidad para enviar tu registro.')
      return
    }

    setSending(true)
    setError('')
    const consentTimestamp = new Date().toISOString()

    try {
      await submitSoftballForm({
        submissionId: globalThis.crypto?.randomUUID?.() || `softball_${Date.now()}`,
        timestamp: consentTimestamp,
        campaignName: 'Club Charros · Juego de sóftbol para afiliados',
        source: 'club-charros-softball-affiliates',
        nombreCompleto: normalizeUppercase(data.nombreCompleto.trim()),
        telefono: data.telefono.trim(),
        cantidadAbonos: Number(data.cantidadAbonos),
        eventoSeleccionado: SOFTBALL_EVENT_ID,
        aceptaAvisoPrivacidad: true,
        aceptaComunicaciones: acceptsCommunications,
        privacyNoticeVersion: '2026-11-02',
        consentTimestamp
      })
      setStep(3)
    } catch (submissionError) {
      console.error(submissionError)
      setError(submissionErrorMessage(submissionError))
    } finally {
      setSending(false)
    }
  }

  async function copyShareLink() {
    setCopyStatus('')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(shareUrl)
      setCopyStatus('Liga copiada. Ya puedes compartirla.')
    } catch {
      setCopyStatus('No se pudo copiar automáticamente. Mantén presionada la liga para copiarla.')
    }
  }

  return (
    <main className={`${baseStyles.page} ${styles.stadiumPage}`}>
      <div className={baseStyles.glow} aria-hidden="true" />
      <section className={baseStyles.card}>
        <a
          className={baseStyles.logoLink}
          href={WHATSAPP_CHANNEL}
          target="_blank"
          rel="noreferrer"
          aria-label="Abrir el canal de difusión de Club Charros en WhatsApp"
        >
          <img className={baseStyles.logo} src={logo} alt="Club Charros, experiencias y recompensas" />
        </a>

        {step < 3 && (
          <div className={baseStyles.progress} aria-label={`Paso ${step} de 2`}>
            <span className={step >= 1 ? baseStyles.activeDot : ''}>1</span>
            <i className={step >= 2 ? baseStyles.activeLine : ''} />
            <span className={step >= 2 ? baseStyles.activeDot : ''}>2</span>
          </div>
        )}

        {step === 1 && (
          <form onSubmit={continueToPrivacy}>
            <p className={baseStyles.eyebrow}>Charromanía afiliada</p>
            <h1 ref={headingRef} tabIndex="-1">¡Regístrate para jugar sóftbol en el Estadio Panamericano!</h1>
            <p className={baseStyles.intro}>
              Participa en la rifa para vivir el campo de Club Charros junto con otros afiliados.
            </p>

            <aside className={styles.registrationNote} aria-label="Información importante del registro">
              <strong>Lugares limitados.</strong>
              <span>Indica cuántos abonos tienes para conocer cuántos participantes puedes registrar.</span>
              <span><strong>Fecha límite:</strong> martes 3 de noviembre de 2026, hasta el final del día.</span>
            </aside>

            <label className={`${baseStyles.field} ${styles.seasonTicketField}`} htmlFor="softball-season-ticket-quantity">
              <span>¿Cuántos abonos tienes?</span>
              <select
                id="softball-season-ticket-quantity"
                value={data.cantidadAbonos}
                onChange={(event) => {
                  setData((current) => ({ ...current, cantidadAbonos: event.target.value }))
                  setError('')
                }}
                aria-describedby={data.cantidadAbonos ? 'softball-registration-allowance' : undefined}
                required
              >
                <option value="">Selecciona una cantidad</option>
                {Array.from({ length: SOFTBALL_MAX_SEASON_TICKETS }, (_, index) => index + 1).map((quantity) => (
                  <option key={quantity} value={quantity}>{quantity}</option>
                ))}
              </select>
              <small>Selecciona la cantidad total de abonos de tu afiliación.</small>
            </label>

            {data.cantidadAbonos && (
              <p
                className={styles.registrationAllowance}
                id="softball-registration-allowance"
                role="status"
                aria-live="polite"
              >
                {Number(data.cantidadAbonos) === 1
                  ? 'Con tu abono, puedes realizar 1 registro. Completa y envía un formulario; se registra una persona a la vez.'
                  : `Con tus ${data.cantidadAbonos} abonos, puedes realizar hasta ${data.cantidadAbonos} registros. Completa y envía un formulario por cada participante; se registra una persona a la vez.`}
              </p>
            )}

            <label className={`${baseStyles.field} ${styles.participantField}`} htmlFor="softball-full-name">
              <span>Nombre completo</span>
              <input
                id="softball-full-name"
                autoComplete="name"
                maxLength="140"
                placeholder="NOMBRE COMPLETO"
                value={data.nombreCompleto}
                onChange={(event) => {
                  setData((current) => ({ ...current, nombreCompleto: normalizeUppercase(event.target.value) }))
                  setError('')
                }}
                required
              />
              <small>Tu nombre se guardará en mayúsculas.</small>
            </label>

            <label className={`${baseStyles.field} ${styles.participantField}`} htmlFor="softball-phone">
              <span>Número de teléfono</span>
              <input
                id="softball-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength="32"
                placeholder="33 1234 5678"
                value={data.telefono}
                onChange={(event) => {
                  setData((current) => ({ ...current, telefono: event.target.value }))
                  setError('')
                }}
                required
              />
              <small>Ingresa 10 dígitos; también puedes incluir la clave +52.</small>
            </label>

            <fieldset className={baseStyles.eventFieldset}>
              <legend>Selecciona el evento al que quieres registrarte</legend>
              <p className={baseStyles.eventHelp}>Confirma tu participación seleccionando el evento.</p>
              <div className={baseStyles.eventGrid}>
                <label
                  className={`${baseStyles.eventCard} ${data.eventoSeleccionado === SOFTBALL_EVENT_ID ? baseStyles.eventCardSelected : ''}`}
                >
                  <input
                    type="radio"
                    name="eventoSeleccionado"
                    value={SOFTBALL_EVENT_ID}
                    checked={data.eventoSeleccionado === SOFTBALL_EVENT_ID}
                    onChange={(event) => {
                      setData((current) => ({ ...current, eventoSeleccionado: event.target.value }))
                      setError('')
                    }}
                  />
                  <span className={baseStyles.eventCopy}>
                    <strong>Juego de sóftbol para afiliados de Club Charros</strong>
                    <span>Domingo 8 de noviembre de 2026 · 9:00 a.m.</span>
                    <span>Campo del Estadio Panamericano · Charros de Jalisco</span>
                    <em className={styles.eventBadge}>Experiencia exclusiva para afiliados</em>
                  </span>
                </label>
              </div>
            </fieldset>

            {error && <p className={baseStyles.error} role="alert">{error}</p>}
            <button className={baseStyles.primaryButton} type="submit">Continuar</button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={submit}>
            <p className={baseStyles.eyebrow}>Antes de finalizar</p>
            <h1 ref={headingRef} tabIndex="-1">Aviso de Privacidad</h1>
            <p className={baseStyles.intro}>
              Tus datos serán utilizados para registrar tu participación, administrar esta dinámica y contactarte por WhatsApp en caso de ser seleccionado.
            </p>
            <a className={baseStyles.privacyLink} href="https://www.charrosjalisco.com/aviso-de-privacidad" target="_blank" rel="noreferrer">
              Consultar Aviso de Privacidad completo
            </a>

            <label className={baseStyles.checkField}>
              <input type="checkbox" checked={acceptsPrivacy} onChange={(event) => setAcceptsPrivacy(event.target.checked)} />
              <span>Acepto el Aviso de Privacidad de Charros de Jalisco. <strong>*</strong></span>
            </label>
            <label className={baseStyles.checkField}>
              <input type="checkbox" checked={acceptsCommunications} onChange={(event) => setAcceptsCommunications(event.target.checked)} />
              <span>Acepto recibir información sobre eventos, experiencias y recompensas.</span>
            </label>

            {error && <p className={baseStyles.error} role="alert">{error}</p>}
            <div className={baseStyles.actions}>
              <button
                className={baseStyles.secondaryButton}
                type="button"
                onClick={() => {
                  setError('')
                  setAcceptsPrivacy(false)
                  setAcceptsCommunications(false)
                  setStep(1)
                }}
              >
                Atrás
              </button>
              <button className={baseStyles.primaryButton} type="submit" disabled={sending}>{sending ? 'Enviando…' : 'Enviar registro'}</button>
            </div>
          </form>
        )}

        {step === 3 && (
          <>
            <div className={baseStyles.success} role="status">
              <span className={baseStyles.successIcon} aria-hidden="true">✓</span>
              <p className={baseStyles.eyebrow}>Registro completado</p>
              <h1 ref={headingRef} tabIndex="-1">¡Tu participación fue registrada!</h1>
              <p>
                Gracias por participar. Publicaremos los avisos generales en nuestro canal de difusión de WhatsApp y, si tu lugar queda asegurado en la rifa, te contactaremos personalmente por WhatsApp al número que registraste.
              </p>
              <a className={baseStyles.primaryButton} href={WHATSAPP_CHANNEL} target="_blank" rel="noreferrer">Ir al canal de WhatsApp</a>
            </div>
            <section
              className={`${styles.shareBox} ${styles.successShareBox}`}
              aria-labelledby="softball-share-title"
            >
              <strong className={styles.shareBoxTitle} id="softball-share-title">Comparte este registro</strong>
              <p>Copia la liga y envíasela a otra persona afiliada que quiera participar.</p>
              <div className={styles.shareControls}>
                <a className={styles.shareLink} href={shareUrl}>{shareUrl}</a>
                <button className={styles.copyButton} type="button" onClick={copyShareLink}>Copiar liga</button>
              </div>
              <p className={styles.copyStatus} role="status" aria-live="polite">{copyStatus}</p>
            </section>
          </>
        )}
      </section>
      <p className={`${baseStyles.footer} ${styles.stadiumFooter}`}>Charros de Jalisco · Experiencias que nos unen</p>
    </main>
  )
}
