import React, { useEffect, useRef, useState } from 'react'
import logo from '../rewards/assets/club-charros-recompensas.jpeg'
import { submitArjonaForm } from './submitArjonaForm'
import baseStyles from '../rewards/RewardsRegistration.module.css'
import styles from './ArjonaRegistration.module.css'

const WHATSAPP_CHANNEL = 'https://whatsapp.com/channel/0029VbE1306LSmbVPqM1Ro02'
export const ARJONA_EVENT_ID = 'ricardo-arjona-pase-doble-2026-11-16'
export const ARJONA_REGISTRATION_DEADLINE_ISO = '2026-11-13T15:00:00.000Z'
const ARJONA_REGISTRATION_DEADLINE_MS = Date.parse(ARJONA_REGISTRATION_DEADLINE_ISO)

export function isArjonaRegistrationOpen(now = Date.now()) {
  return now < ARJONA_REGISTRATION_DEADLINE_MS
}

function normalizeUppercase(value) {
  return value.toLocaleUpperCase('es-MX')
}

export default function ArjonaRegistration() {
  const [step, setStep] = useState(1)
  const [submissionId] = useState(
    () => globalThis.crypto?.randomUUID?.() || `arjona_${Date.now()}`
  )
  const [registrationOpen, setRegistrationOpen] = useState(() => isArjonaRegistrationOpen())
  const [data, setData] = useState({
    nombreCompleto: '',
    eventoSeleccionado: '',
    recomendacion: ''
  })
  const [acceptsPrivacy, setAcceptsPrivacy] = useState(false)
  const [acceptsCommunications, setAcceptsCommunications] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Ricardo Arjona | Experiencias Club Charros'
    const remainingMs = ARJONA_REGISTRATION_DEADLINE_MS - Date.now()
    const timer = remainingMs > 0
      ? window.setTimeout(() => setRegistrationOpen(false), remainingMs)
      : null

    return () => {
      document.title = previousTitle
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [step, registrationOpen])

  function continueToPrivacy(event) {
    event.preventDefault()
    if (!isArjonaRegistrationOpen()) {
      setRegistrationOpen(false)
      return
    }

    const fullName = data.nombreCompleto.trim()
    const recommendation = data.recomendacion.trim()
    if (fullName.length < 5 || !fullName.includes(' ')) {
      setError('Escribe tu nombre completo.')
      return
    }
    if (data.eventoSeleccionado !== ARJONA_EVENT_ID) {
      setError('Selecciona la rifa de Ricardo Arjona para participar.')
      return
    }
    if (recommendation.length < 5) {
      setError('Cuéntanos brevemente qué recomendarías al Club Charros.')
      return
    }
    setError('')
    setStep(2)
  }

  async function submit(event) {
    event.preventDefault()
    if (!isArjonaRegistrationOpen()) {
      setRegistrationOpen(false)
      return
    }
    if (!acceptsPrivacy) {
      setError('Debes aceptar el Aviso de Privacidad para enviar tu respuesta.')
      return
    }

    setSending(true)
    setError('')
    try {
      await submitArjonaForm({
        submissionId,
        timestamp: new Date().toISOString(),
        campaignName: 'Club Charros · Pase doble Ricardo Arjona 2026',
        source: 'ricardo-arjona-2026',
        nombreCompleto: normalizeUppercase(data.nombreCompleto.trim()),
        eventoSeleccionado: data.eventoSeleccionado,
        recomendacion: data.recomendacion.trim(),
        aceptaAvisoPrivacidad: true,
        aceptaComunicaciones: acceptsCommunications,
        privacyNoticeVersion: '2026-11-11',
        consentTimestamp: new Date().toISOString()
      })
      setStep(3)
    } catch (submissionError) {
      if (submissionError?.status === 410) {
        setRegistrationOpen(false)
      } else {
        console.error(submissionError)
        setError('No pudimos guardar tu participación. Revisa tu conexión e inténtalo nuevamente.')
      }
    } finally {
      setSending(false)
    }
  }

  function toggleEvent() {
    setData((current) => ({
      ...current,
      eventoSeleccionado: current.eventoSeleccionado === ARJONA_EVENT_ID
        ? ''
        : ARJONA_EVENT_ID
    }))
    setError('')
  }

  return (
    <main className={baseStyles.page}>
      <div className={baseStyles.glow} aria-hidden="true" />
      <section className={baseStyles.card} ref={panelRef} tabIndex="-1">
        <a
          className={baseStyles.logoLink}
          href={WHATSAPP_CHANNEL}
          target="_blank"
          rel="noreferrer"
          aria-label="Abrir el canal de difusión de Club Charros en WhatsApp"
        >
          <img
            className={baseStyles.logo}
            src={logo}
            alt="Club Charros, experiencias y recompensas"
          />
        </a>

        {!registrationOpen ? (
          <div className={styles.closed} role="status">
            <p className={styles.closedBadge}>Registro cerrado</p>
            <h1>La convocatoria para Ricardo Arjona ha finalizado</h1>
            <p>
              El registro cerró el viernes 13 de noviembre de 2026 a las 9:00 a. m.
              Gracias por participar en las experiencias de Club Charros.
            </p>
            <a
              className={baseStyles.primaryButton}
              href={WHATSAPP_CHANNEL}
              target="_blank"
              rel="noreferrer"
            >
              Ir al canal de WhatsApp
            </a>
          </div>
        ) : (
          <>
            {step < 3 && (
              <div className={baseStyles.progress} aria-label={`Paso ${step} de 2`}>
                <span className={step >= 1 ? baseStyles.activeDot : ''}>1</span>
                <i className={step >= 2 ? baseStyles.activeLine : ''} />
                <span className={step >= 2 ? baseStyles.activeDot : ''}>2</span>
              </div>
            )}

            {step === 1 && (
              <form onSubmit={continueToPrivacy}>
                <p className={baseStyles.eyebrow}>Experiencias Club Charros</p>
                <h1>Participa por un pase doble para Ricardo Arjona</h1>
                <p className={baseStyles.intro}>
                  Registra tu participación para el concierto de Ricardo Arjona del lunes 16 de
                  noviembre de 2026.
                </p>
                <p className={styles.deadlineNotice}>
                  <strong>Participa antes del cierre:</strong> viernes 13 de noviembre de 2026 a
                  las 9:00 a. m.
                </p>

                <label className={baseStyles.field} htmlFor="arjona-full-name">
                  <span>Nombre completo</span>
                  <input
                    id="arjona-full-name"
                    autoComplete="name"
                    maxLength="140"
                    placeholder="NOMBRE COMPLETO"
                    value={data.nombreCompleto}
                    onChange={(event) => setData((current) => ({
                      ...current,
                      nombreCompleto: normalizeUppercase(event.target.value)
                    }))}
                    required
                  />
                  <small>Tu nombre se guardará en mayúsculas.</small>
                </label>

                <fieldset className={baseStyles.eventFieldset}>
                  <legend>¿Quieres participar en la rifa?</legend>
                  <p className={baseStyles.eventHelp}>
                    Selecciona el evento para registrar tu participación.
                  </p>
                  <div className={baseStyles.eventGrid}>
                    <label
                      className={`${baseStyles.eventCard} ${
                        data.eventoSeleccionado === ARJONA_EVENT_ID
                          ? baseStyles.eventCardSelected
                          : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={data.eventoSeleccionado === ARJONA_EVENT_ID}
                        onChange={toggleEvent}
                      />
                      <span className={baseStyles.eventCopy}>
                        <strong>Ricardo Arjona</strong>
                        <span>Lunes 16 de noviembre de 2026</span>
                        <em>Pase doble para el concierto</em>
                      </span>
                    </label>
                  </div>
                </fieldset>

                <label className={baseStyles.field} htmlFor="arjona-recommendation">
                  <span>¿Qué recomendarías al Club Charros para hacer de tu experiencia mejor?</span>
                  <textarea
                    id="arjona-recommendation"
                    maxLength="1200"
                    rows="5"
                    placeholder="Escribe aquí tu recomendación…"
                    value={data.recomendacion}
                    onChange={(event) => setData((current) => ({
                      ...current,
                      recomendacion: event.target.value
                    }))}
                    required
                  />
                  <small>{data.recomendacion.length}/1200 caracteres</small>
                </label>

                {error && <p className={baseStyles.error} role="alert">{error}</p>}
                <button className={baseStyles.primaryButton} type="submit">Continuar</button>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={submit}>
                <p className={baseStyles.eyebrow}>Antes de finalizar</p>
                <h1>Aviso de Privacidad</h1>
                <p className={baseStyles.intro}>
                  Tus datos serán utilizados para registrar tu participación, conocer tu opinión
                  y administrar dinámicas, eventos o recompensas de Charros de Jalisco.
                </p>
                <a
                  className={baseStyles.privacyLink}
                  href="https://www.charrosjalisco.com/aviso-de-privacidad"
                  target="_blank"
                  rel="noreferrer"
                >
                  Consultar Aviso de Privacidad completo
                </a>

                <label className={baseStyles.checkField}>
                  <input
                    type="checkbox"
                    checked={acceptsPrivacy}
                    onChange={(event) => setAcceptsPrivacy(event.target.checked)}
                    aria-required="true"
                  />
                  <span>
                    Acepto el Aviso de Privacidad de Charros de Jalisco. <strong>*</strong>
                  </span>
                </label>
                <label className={baseStyles.checkField}>
                  <input
                    type="checkbox"
                    checked={acceptsCommunications}
                    onChange={(event) => setAcceptsCommunications(event.target.checked)}
                  />
                  <span>Acepto recibir información sobre eventos, experiencias y recompensas.</span>
                </label>

                {error && <p className={baseStyles.error} role="alert">{error}</p>}
                <div className={baseStyles.actions}>
                  <button
                    className={baseStyles.secondaryButton}
                    type="button"
                    onClick={() => { setError(''); setStep(1) }}
                  >
                    Atrás
                  </button>
                  <button
                    className={baseStyles.primaryButton}
                    type="submit"
                    disabled={sending}
                  >
                    {sending ? 'Enviando…' : 'Enviar participación'}
                  </button>
                </div>
              </form>
            )}

            {step === 3 && (
              <div className={baseStyles.success} role="status">
                <span className={baseStyles.successIcon} aria-hidden="true">✓</span>
                <p className={baseStyles.eyebrow}>Registro completado</p>
                <h1>¡Tu participación fue registrada!</h1>
                <p>Ya estás participando por el pase doble para Ricardo Arjona.</p>
                <a
                  className={baseStyles.primaryButton}
                  href={WHATSAPP_CHANNEL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ir al canal de WhatsApp
                </a>
              </div>
            )}
          </>
        )}
      </section>
      <p className={baseStyles.footer}>Charros de Jalisco · Experiencias que nos unen</p>
    </main>
  )
}
