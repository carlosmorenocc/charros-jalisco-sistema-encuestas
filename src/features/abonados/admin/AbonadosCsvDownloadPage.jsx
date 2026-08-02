import React, { useEffect, useState } from 'react'
import logo from '../../../assets/logo.png'
import {
  AbonadosCsvDownloadError,
  downloadAbonadosCsv
} from './downloadAbonadosCsv'
import styles from './AbonadosCsvDownloadPage.module.css'

const INITIAL_STATUS = {
  kind: 'idle',
  message: 'La clave se utiliza únicamente para esta solicitud y no se guarda en el navegador.'
}

function friendlyError(error) {
  if (error instanceof AbonadosCsvDownloadError) return error.message
  return 'Ocurrió un error inesperado. Intenta nuevamente.'
}

export default function AbonadosCsvDownloadPage() {
  const [token, setToken] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [status, setStatus] = useState(INITIAL_STATUS)

  useEffect(() => {
    const previousTitle = document.title
    const existingRobotsMeta = document.querySelector('meta[name="robots"]')
    const previousRobotsContent = existingRobotsMeta?.getAttribute('content')
    const robotsMeta = existingRobotsMeta || document.createElement('meta')

    document.title = 'Exportación privada de abonados | Charros de Jalisco'
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
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!token.trim()) {
      setStatus({ kind: 'error', message: 'Ingresa la clave de descarga.' })
      return
    }

    setIsDownloading(true)
    setStatus({ kind: 'loading', message: 'Preparando la descarga segura…' })

    try {
      const filename = await downloadAbonadosCsv({ token })
      setStatus({
        kind: 'success',
        message: `Descarga completada: ${filename}`
      })
    } catch (error) {
      setStatus({ kind: 'error', message: friendlyError(error) })
    } finally {
      setToken('')
      setIsDownloading(false)
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="export-title">
        <img className={styles.logo} src={logo} alt="Charros de Jalisco" />
        <span className={styles.eyebrow}>Acceso administrativo</span>
        <h1 id="export-title">Registros de abonados</h1>
        <p className={styles.intro}>
          Descarga una copia actualizada de los registros de la campaña LMP 2026-2027.
        </p>
        <p className={styles.privacyNotice}>
          <strong>Información confidencial:</strong> el archivo contiene datos personales y debe
          resguardarse únicamente en equipos autorizados.
        </p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <label htmlFor="csv-export-token">Clave de descarga</label>
          <input
            id="csv-export-token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            spellCheck="false"
            required
            disabled={isDownloading}
            aria-describedby="token-help export-status"
          />
          <small id="token-help" className={styles.help}>
            Usa la clave privada ABONADOS_CSV_EXPORT_TOKEN configurada en Render. No la compartas.
          </small>

          <button type="submit" disabled={isDownloading}>
            {isDownloading ? 'Descargando…' : 'Descargar registros CSV'}
          </button>
        </form>

        <p
          id="export-status"
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
