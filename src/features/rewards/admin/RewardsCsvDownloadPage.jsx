import React, { useEffect, useState } from 'react'
import logo from '../../../assets/logo.png'
import { ProtectedCsvDownloadError } from '../../registros/admin/downloadProtectedCsv'
import adminStyles from '../../abonados/admin/AbonadosCsvDownloadPage.module.css'
import { downloadRewardsCsv } from './downloadRewardsCsv'
import { downloadSoftballCsv } from './downloadSoftballCsv'
import styles from './RewardsCsvDownloadPage.module.css'

const INITIAL_STATUS = {
  kind: 'idle',
  message: 'La clave se utiliza únicamente para esta solicitud y no se guarda en el navegador.'
}

function friendlyError(error) {
  if (error instanceof ProtectedCsvDownloadError) return error.message
  return 'Ocurrió un error inesperado. Intenta nuevamente.'
}

function CsvDownloadSection({
  kind,
  label,
  heading,
  intro,
  buttonText,
  idPrefix,
  downloadCsv
}) {
  const [token, setToken] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [status, setStatus] = useState(INITIAL_STATUS)

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

  const headingId = `${idPrefix}-title`
  const tokenInputId = `${idPrefix}-csv-export-token`
  const tokenHelpId = `${idPrefix}-token-help`
  const statusId = `${idPrefix}-export-status`

  return (
    <section
      className={styles.downloadSection}
      data-export-kind={kind}
      aria-labelledby={headingId}
    >
      <span className={styles.sectionLabel}>{label}</span>
      <h2 id={headingId}>{heading}</h2>
      <p className={styles.sectionIntro}>{intro}</p>

      <form className={adminStyles.form} onSubmit={handleSubmit} noValidate>
        <label htmlFor={tokenInputId}>Clave de descarga para {heading}</label>
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
        <small id={tokenHelpId} className={adminStyles.help}>
          Usa la clave privada CSV_EXPORT_TOKEN configurada en Render. No la compartas.
        </small>

        <button type="submit" disabled={isDownloading}>
          {isDownloading ? 'Descargando…' : buttonText}
        </button>
      </form>

      <p
        id={statusId}
        className={`${adminStyles.status} ${adminStyles[status.kind]}`}
        role={status.kind === 'error' ? 'alert' : 'status'}
        aria-live={status.kind === 'error' ? 'assertive' : 'polite'}
      >
        {status.message}
      </p>
    </section>
  )
}

export default function RewardsCsvDownloadPage() {
  useEffect(() => {
    const previousTitle = document.title
    const existingRobotsMeta = document.querySelector('meta[name="robots"]')
    const previousRobotsContent = existingRobotsMeta?.getAttribute('content')
    const robotsMeta = existingRobotsMeta || document.createElement('meta')

    document.title = 'Experiencias y Recompensas | Charros de Jalisco'
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

  return (
    <main className={adminStyles.page}>
      <section
        className={`${adminStyles.card} ${styles.rewardsCard}`}
        aria-labelledby="experiencias-recompensas-export-title"
      >
        <img className={adminStyles.logo} src={logo} alt="Charros de Jalisco" />
        <span className={adminStyles.eyebrow}>Acceso administrativo</span>
        <h1 id="experiencias-recompensas-export-title">Bases de participaciones</h1>
        <p className={adminStyles.intro}>
          Descarga por separado el histórico de experiencias y la convocatoria del partido de
          sóftbol para afiliados.
        </p>
        <p className={adminStyles.privacyNotice}>
          <strong>Información confidencial:</strong> los archivos contienen datos personales y
          deben resguardarse únicamente en equipos autorizados.
        </p>

        <div className={styles.downloads}>
          <CsvDownloadSection
            kind="historical"
            label="Base histórica"
            heading="Papá sobre Ruedas y Romeo Santos"
            intro="Participaciones anteriores de experiencias y recompensas. Esta base se conserva sin mezclar registros nuevos."
            buttonText="Descargar histórico CSV"
            idPrefix="experiencias-recompensas-historico"
            downloadCsv={downloadRewardsCsv}
          />
          <CsvDownloadSection
            kind="softball"
            label="Evento independiente"
            heading="Partido de sóftbol para afiliados"
            intro="Incluye exclusivamente las personas registradas para jugar en el Estadio Panamericano el 8 de noviembre de 2026."
            buttonText="Descargar sóftbol CSV"
            idPrefix="experiencias-recompensas-softbol"
            downloadCsv={downloadSoftballCsv}
          />
        </div>
      </section>
    </main>
  )
}
