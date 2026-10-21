import React, { useEffect, useRef, useState } from 'react'
import logo from './assets/club-charros-recompensas.jpeg'
import { submitRewardsForm } from './submitRewardsForm'
import styles from './RewardsRegistration.module.css'

const WHATSAPP_CHANNEL = 'https://whatsapp.com/channel/0029VbE1306LSmbVPqM1Ro02'

function normalizeUppercase(value) {
  return value.toLocaleUpperCase('es-MX')
}

export default function RewardsRegistration() {
  const [step, setStep] = useState(1)
  const [data, setData] = useState({ nombreCompleto: '', recomendacion: '' })
  const [acceptsPrivacy, setAcceptsPrivacy] = useState(false)
  const [acceptsCommunications, setAcceptsCommunications] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [step])

  function continueToPrivacy(event) {
    event.preventDefault()
    const fullName = data.nombreCompleto.trim()
    const recommendation = data.recomendacion.trim()
    if (fullName.length < 5 || !fullName.includes(' ')) {
      setError('Escribe tu nombre completo.')
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
    if (!acceptsPrivacy) {
      setError('Debes aceptar el Aviso de Privacidad para enviar tu respuesta.')
      return
    }

    setSending(true)
    setError('')
    try {
      await submitRewardsForm({
        submissionId: crypto.randomUUID?.() || `reward_${Date.now()}`,
        timestamp: new Date().toISOString(),
        campaignName: 'Club Charros · Experiencias y Recompensas',
        source: 'club-charros-rewards',
        nombreCompleto: normalizeUppercase(data.nombreCompleto.trim()),
        recomendacion: data.recomendacion.trim(),
        aceptaAvisoPrivacidad: true,
        aceptaComunicaciones: acceptsCommunications,
        privacyNoticeVersion: '2026-10-20',
        consentTimestamp: new Date().toISOString()
      })
      setStep(3)
    } catch (submissionError) {
      console.error(submissionError)
      setError('No pudimos enviar tu respuesta. Revisa tu conexión e inténtalo nuevamente.')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <section className={styles.card} ref={panelRef} tabIndex="-1">
        <a
          className={styles.logoLink}
          href={WHATSAPP_CHANNEL}
          target="_blank"
          rel="noreferrer"
          aria-label="Abrir el canal de difusión de Club Charros en WhatsApp"
        >
          <img className={styles.logo} src={logo} alt="Club Charros, experiencias y recompensas" />
        </a>

        {step < 3 && (
          <div className={styles.progress} aria-label={`Paso ${step} de 2`}>
            <span className={step >= 1 ? styles.activeDot : ''}>1</span>
            <i className={step >= 2 ? styles.activeLine : ''} />
            <span className={step >= 2 ? styles.activeDot : ''}>2</span>
          </div>
        )}

        {step === 1 && (
          <form onSubmit={continueToPrivacy}>
            <p className={styles.eyebrow}>Tu voz también juega</p>
            <h1>Participa en experiencias y recompensas</h1>
            <p className={styles.intro}>Déjanos tu recomendación y registra tu participación en las dinámicas de Club Charros.</p>

            <label className={styles.field} htmlFor="rewards-full-name">
              <span>Nombre completo</span>
              <input
                id="rewards-full-name"
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

            <label className={styles.field} htmlFor="rewards-recommendation">
              <span>¿Qué recomendarías al Club Charros para hacer de tu experiencia mejor?</span>
              <textarea
                id="rewards-recommendation"
                maxLength="1200"
                rows="5"
                placeholder="Escribe aquí tu recomendación…"
                value={data.recomendacion}
                onChange={(event) => setData((current) => ({ ...current, recomendacion: event.target.value }))}
                required
              />
              <small>{data.recomendacion.length}/1200 caracteres</small>
            </label>

            {error && <p className={styles.error} role="alert">{error}</p>}
            <button className={styles.primaryButton} type="submit">Continuar</button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={submit}>
            <p className={styles.eyebrow}>Antes de finalizar</p>
            <h1>Aviso de Privacidad</h1>
            <p className={styles.intro}>
              Tus datos serán utilizados para registrar tu participación, conocer tu opinión y administrar dinámicas, eventos o recompensas de Charros de Jalisco.
            </p>
            <a className={styles.privacyLink} href="https://www.charrosjalisco.com/aviso-de-privacidad" target="_blank" rel="noreferrer">
              Consultar Aviso de Privacidad completo
            </a>

            <label className={styles.checkField}>
              <input type="checkbox" checked={acceptsPrivacy} onChange={(event) => setAcceptsPrivacy(event.target.checked)} />
              <span>Acepto el Aviso de Privacidad de Charros de Jalisco. <strong>*</strong></span>
            </label>
            <label className={styles.checkField}>
              <input type="checkbox" checked={acceptsCommunications} onChange={(event) => setAcceptsCommunications(event.target.checked)} />
              <span>Acepto recibir información sobre eventos, experiencias y recompensas.</span>
            </label>

            {error && <p className={styles.error} role="alert">{error}</p>}
            <div className={styles.actions}>
              <button className={styles.secondaryButton} type="button" onClick={() => { setError(''); setStep(1) }}>Atrás</button>
              <button className={styles.primaryButton} type="submit" disabled={sending}>{sending ? 'Enviando…' : 'Enviar respuesta'}</button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className={styles.success} role="status">
            <span className={styles.successIcon} aria-hidden="true">✓</span>
            <p className={styles.eyebrow}>Registro completado</p>
            <h1>¡Tu respuesta fue enviada!</h1>
            <p>Gracias por ayudarnos a crear mejores experiencias. Ya estás participando en las dinámicas de Club Charros.</p>
            <a className={styles.primaryButton} href={WHATSAPP_CHANNEL} target="_blank" rel="noreferrer">Ir al canal de WhatsApp</a>
          </div>
        )}
      </section>
      <p className={styles.footer}>Charros de Jalisco · Experiencias que nos unen</p>
    </main>
  )
}
