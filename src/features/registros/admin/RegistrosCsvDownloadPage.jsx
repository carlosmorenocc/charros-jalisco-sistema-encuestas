import React, { useEffect, useState } from 'react'
import logo from '../../../assets/logo.png'
import {
  downloadRegistrosCsv,
  RegistrosCsvDownloadError
} from './downloadRegistrosCsv'
import styles from '../../abonados/admin/AbonadosCsvDownloadPage.module.css'

const INITIAL_STATUS = {
  kind: 'idle',
  message: 'La clave se utiliza únicamente para esta solicitud y no se guarda en el navegador.'
}

function friendlyError(error) {
  if (error instanceof RegistrosCsvDownloadError) return error.message
  return 'Ocurrió un error inesperado. Intenta nuevamente.'
}

export default function RegistrosCsvDownloadPage() {
  const [token, setToken] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [status, setStatus] = useState(INITIAL_STATUS)

  useEffect(() => {
    const previousTitle = document.title
    const existingRobotsMeta = document.querySelector('meta[name="robots"]')
    const previousRobotsContent = existingRobotsMeta?.getAttribute('content')
    const robotsMeta = existingRobotsMeta || document.createElement('meta')

    document.title = 'Exportación del Registro Oficial | Charros de Jalisco'
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
      const filename = await downloadRegistrosCsv({ token })
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
        <h1 id="export-title">Registro Oficial</h1>
        <p className={styles.intro}>
          Descarga una copia actualizada de la base principal de registros de Charros de Jalisco.
        </p>
        <p className={styles.privacyNotice}>
          <strong>Información confidencial:</strong> el archivo contiene datos personales y debe
          resguardarse únicamente en equipos autorizados.
        </p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <label htmlFor="registros-csv-export-token">Clave de descarga</label>
          <input
            id="registros-csv-export-token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            spellCheck="false"
            required
            disabled={isDownloading}
            aria-describedby="registros-token-help registros-export-status"
          />
          <small id="registros-token-help" className={styles.help}>
            Usa la clave privada CSV_EXPORT_TOKEN configurada en Render. No la compartas.
          </small>

          <button type="submit" disabled={isDownloading}>
            {isDownloading ? 'Descargando…' : 'Descargar Registro Oficial CSV'}
          </button>
        </form>

        <p
          id="registros-export-status"
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
