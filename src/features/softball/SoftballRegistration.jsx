import React, { useEffect, useMemo, useRef, useState } from 'react'
import logo from '../rewards/assets/club-charros-recompensas.jpeg'
import baseStyles from '../rewards/RewardsRegistration.module.css'
import styles from './SoftballRegistration.module.css'
import { submitSoftballForm } from './submitSoftballForm'

const WHATSAPP_CHANNEL = 'https://whatsapp.com/channel/0029VbE1306LSmbVPqM1Ro02'
const SOFTBALL_EVENT_ID = 'softbol-club-charros-2026-11-08'
const SOFTBALL_MAX_SEASON_TICKETS = 20

function emptyParticipant() {
  return { nombreCompleto: '', telefono: '' }
}

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
    return 'Una o más personas ya están registradas. Revisa la lista; cada persona solo puede registrarse una vez.'
  }
  if (error?.status === 410) {
    return 'El periodo de registro cerró al finalizar el martes 3 de noviembre.'
  }
  if (error?.status === 400) {
    return 'Revisa la cantidad de abonos, los datos de cada participante y el evento seleccionado.'
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
    participantes: [],
    eventoSeleccionado: ''
  })
  const [acceptsPrivacy, setAcceptsPrivacy] = useState(false)
  const [acceptsCommunications, setAcceptsCommunications] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const headingRef = useRef(null)
  const submissionIdRef = useRef('')
  const shareUrl = useMemo(getShareUrl, [])

  if (!submissionIdRef.current) {
    submissionIdRef.current = globalThis.crypto?.randomUUID?.() || `softball_${Date.now()}`
  }

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [step])

  function updateParticipantQuantity(value) {
    const quantity = Number(value)
    setData((current) => ({
      ...current,
      cantidadAbonos: value,
      participantes: Number.isInteger(quantity) && quantity >= 1
        ? Array.from(
          { length: quantity },
          (_, index) => current.participantes[index] || emptyParticipant()
        )
        : []
    }))
    setError('')
  }

  function updateParticipant(index, field, value) {
    setData((current) => ({
      ...current,
      participantes: current.participantes.map((participant, participantIndex) => (
        participantIndex === index
          ? { ...participant, [field]: value }
          : participant
      ))
    }))
    setError('')
  }

  function continueToPrivacy(event) {
    event.preventDefault()
    const seasonTicketQuantity = Number(data.cantidadAbonos)

    if (
      !Number.isInteger(seasonTicketQuantity)
      || seasonTicketQuantity < 1
      || seasonTicketQuantity > SOFTBALL_MAX_SEASON_TICKETS
    ) {
      setError('Selecciona cuántos de tus abonos participan.')
      return
    }

    if (data.participantes.length !== seasonTicketQuantity) {
      setError('Completa los datos de todas las personas participantes.')
      return
    }

    for (const [index, participant] of data.participantes.entries()) {
      const fullName = participant.nombreCompleto.trim()
      const phoneValue = participant.telefono.trim()
      const phoneDigits = normalizeMexicanPhone(phoneValue)

      if (!validParticipantName(fullName)) {
        setError(`Escribe el nombre completo de la persona ${index + 1}.`)
        return
      }
      if (!/^\+?[0-9() .-]+$/.test(phoneValue) || phoneDigits.length !== 10) {
        setError(`Escribe un número de teléfono mexicano válido de 10 dígitos para la persona ${index + 1}.`)
        return
      }
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
    const participants = data.participantes.map((participant) => ({
      nombreCompleto: normalizeUppercase(participant.nombreCompleto.trim()),
      telefono: participant.telefono.trim()
    }))

    try {
      await submitSoftballForm({
        submissionId: submissionIdRef.current,
        timestamp: consentTimestamp,
        campaignName: 'Club Charros · Juego de sóftbol para afiliados',
        source: 'club-charros-softball-affiliates',
        participantes: participants,
        nombreCompleto: participants[0].nombreCompleto,
        telefono: participants[0].telefono,
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
              <span>Indica cuántos de tus abonos participan y registra a todas las personas en un solo envío.</span>
              <span><strong>Fecha límite:</strong> martes 3 de noviembre de 2026, hasta el final del día.</span>
            </aside>

            <label className={`${baseStyles.field} ${styles.seasonTicketField}`} htmlFor="softball-season-ticket-quantity">
              <span>¿Cuántos de tus abonos participan?</span>
              <select
                id="softball-season-ticket-quantity"
                value={data.cantidadAbonos}
                onChange={(event) => updateParticipantQuantity(event.target.value)}
                aria-describedby={data.cantidadAbonos ? 'softball-registration-allowance' : undefined}
                required
              >
                <option value="">Selecciona una cantidad</option>
                {Array.from({ length: SOFTBALL_MAX_SEASON_TICKETS }, (_, index) => index + 1).map((quantity) => (
                  <option key={quantity} value={quantity}>{quantity}</option>
                ))}
              </select>
              <small>Selecciona cuántos de tus abonos participarán en esta dinámica.</small>
            </label>

            {data.cantidadAbonos && (
              <p
                className={styles.registrationAllowance}
                id="softball-registration-allowance"
                role="status"
                aria-live="polite"
              >
                {Number(data.cantidadAbonos) === 1
                  ? 'Captura los datos de la persona participante. Al enviar, se generará 1 registro individual.'
                  : `Captura los datos de las ${data.cantidadAbonos} personas participantes. Al enviar, cada persona se guardará como un registro individual.`}
              </p>
            )}

            {data.participantes.length > 0 && (
              <section className={styles.participantsSection} aria-labelledby="softball-participants-title">
                <div className={styles.participantsHeading}>
                  <div>
                    <h2 id="softball-participants-title">Datos de participantes</h2>
                    <p>Completa el nombre y teléfono de contacto de cada persona.</p>
                  </div>
                  <span>{data.participantes.length} {data.participantes.length === 1 ? 'persona' : 'personas'}</span>
                </div>

                <div className={styles.participantList}>
                  {data.participantes.map((participant, index) => (
                    <fieldset className={styles.participantCard} key={index}>
                      <legend>
                        <span>Participante</span>
                        <strong>{index + 1} de {data.participantes.length}</strong>
                      </legend>

                      <label
                        className={`${baseStyles.field} ${styles.participantField}`}
                        htmlFor={`softball-full-name-${index}`}
                      >
                        <span>Nombre completo</span>
                        <input
                          id={`softball-full-name-${index}`}
                          autoComplete={index === 0 ? 'name' : 'off'}
                          maxLength="140"
                          placeholder="NOMBRE COMPLETO"
                          value={participant.nombreCompleto}
                          onChange={(event) => updateParticipant(
                            index,
                            'nombreCompleto',
                            normalizeUppercase(event.target.value)
                          )}
                          required
                        />
                        <small>Se guardará en mayúsculas.</small>
                      </label>

                      <label
                        className={`${baseStyles.field} ${styles.participantField}`}
                        htmlFor={`softball-phone-${index}`}
                      >
                        <span>Número de teléfono</span>
                        <input
                          id={`softball-phone-${index}`}
                          type="tel"
                          inputMode="tel"
                          autoComplete={index === 0 ? 'tel' : 'off'}
                          maxLength="32"
                          placeholder="33 1234 5678"
                          value={participant.telefono}
                          onChange={(event) => updateParticipant(index, 'telefono', event.target.value)}
                          required
                        />
                        <small>Ingresa 10 dígitos; también puedes incluir la clave +52.</small>
                      </label>
                    </fieldset>
                  ))}
                </div>
              </section>
            )}

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
              Los datos que proporciones serán utilizados para registrar las participaciones, administrar esta dinámica y contactar por WhatsApp a las personas seleccionadas.
            </p>
            <p className={styles.submissionSummary}>
              Enviarás <strong>{data.participantes.length} {data.participantes.length === 1 ? 'registro individual' : 'registros individuales'}</strong> en esta operación, uno por cada participante.
            </p>
            <a className={baseStyles.privacyLink} href="https://www.charrosjalisco.com/aviso-de-privacidad" target="_blank" rel="noreferrer">
              Consultar Aviso de Privacidad completo
            </a>

            <label className={baseStyles.checkField}>
              <input type="checkbox" checked={acceptsPrivacy} onChange={(event) => setAcceptsPrivacy(event.target.checked)} />
              <span>
                Acepto el Aviso de Privacidad de Charros de Jalisco y confirmo que tengo autorización de las personas registradas para proporcionar sus datos. <strong>*</strong>
              </span>
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
              <h1 ref={headingRef} tabIndex="-1">
                {data.participantes.length === 1
                  ? '¡Tu participación fue registrada!'
                  : '¡Las participaciones fueron registradas!'}
              </h1>
              <p>
                {data.participantes.length === 1
                  ? 'Guardamos 1 registro individual. Si el lugar queda asegurado en la rifa, contactaremos a la persona por WhatsApp al número registrado.'
                  : `Guardamos ${data.participantes.length} registros individuales. Si algún lugar queda asegurado en la rifa, contactaremos a cada persona por WhatsApp al número registrado.`}
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
