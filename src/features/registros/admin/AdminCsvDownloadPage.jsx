import React, { useEffect, useState } from 'react'
import logo from '../../../assets/logo.png'
import { ProtectedCsvDownloadError } from './downloadProtectedCsv'
import styles from '../../abonados/admin/AbonadosCsvDownloadPage.module.css'

const INITIAL_STATUS = {
  kind: 'idle',
  message: 'La clave se utiliza únicamente para esta solicitud y no se guarda en el navegador.'
}

function friendlyError(error) {
  if (error instanceof ProtectedCsvDownloadError) return error.message
  return 'Ocurrió un error inesperado. Intenta nuevamente.'
}

export default function AdminCsvDownloadPage({
  documentTitle,
  heading,
  intro,
  buttonText,
  idPrefix,
  downloadCsv
}) {
  const [token, setToken] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [status, setStatus] = useState(INITIAL_STATUS)

  useEffect(() => {
    const previousTitle = document.title
    const existingRobotsMeta = document.querySelector('meta[name="robots"]')
    const previousRobotsContent = existingRobotsMeta?.getAttribute('content')
    const robotsMeta = existingRobotsMeta || document.createElement('meta')

    document.title = documentTitle
    robotsMeta.setAttribute('name', 'robots')
    robotsMeta.setAttribute('content', 'noindex, nofollow, noarchive')
    if (!existingRobotsMeta) document.head.appendChild(robotsMeta)

    return () => {
      document.title = previousTitle
      if (existingRobotsMeta) {
        if (previousRobotsContent === null) existingRobotsMeta.removeAttribute('content')
        else existingRobotsMeta.setAttribute('content', previousRobotsContent)
      } else {
        robotsMeta.remove()
      }
    }
  }, [documentTitle])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!token.trim()) {
      setStatus({ kind: 'error', message: 'Ingresa la clave de descarga.' })
      return
    }

    setIsDownloading(true)
    setStatus({ kind: 'loading', message: 'Preparando la descarga segura…' })

    try {
      const filename = await downloadCsv({ token })
      setStatus({ kind: 'success', message: `Descarga completada: ${filename}` })
    } catch (error) {
      setStatus({ kind: 'error', message: friendlyError(error) })
    } finally {
      setToken('')
      setIsDownloading(false)
    }
  }

  const titleId = `${idPrefix}-export-title`
  const tokenInputId = `${idPrefix}-csv-export-token`
  const tokenHelpId = `${idPrefix}-token-help`
  const statusId = `${idPrefix}-export-status`

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby={titleId}>
        <img className={styles.logo} src={logo} alt="Charros de Jalisco" />
        <span className={styles.eyebrow}>Acceso administrativo</span>
        <h1 id={titleId}>{heading}</h1>
        <p className={styles.intro}>{intro}</p>
        <p className={styles.privacyNotice}>
          <strong>Información confidencial:</strong> el archivo contiene datos personales y debe
          resguardarse únicamente en equipos autorizados.
        </p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <label htmlFor={tokenInputId}>Clave de descarga</label>
          <input
            id={tokenInputId}
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            spellCheck="false"
            required
            disabled={isDownloading}
            aria-describedby={`${tokenHelpId} ${statusId}`}
          />
          <small id={tokenHelpId} className={styles.help}>
            Usa la clave privada CSV_EXPORT_TOKEN configurada en Render. No la compartas.
          </small>

          <button type="submit" disabled={isDownloading}>
            {isDownloading ? 'Descargando…' : buttonText}
          </button>
        </form>

        <p
          id={statusId}
          className={`${styles.status} ${styles[status.kind]}`}
          role={status.kind === 'error' ? 'alert' : 'status'}
          aria-live={status.kind === 'error' ? 'assertive' : 'polite'}
        >
          {status.message}
        </p>
      </section>
    </main>
  )
}
