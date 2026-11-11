import {
  createMexicoDatedCsvFilename,
  downloadProtectedCsv,
  ProtectedCsvDownloadError
} from '../../registros/admin/downloadProtectedCsv'

const ARJONA_SUBMISSION_PATH_PATTERN = /\/api\/ricardo-arjona-submit\/?$/
const MAIN_SUBMISSION_PATH_PATTERN = /\/api\/submit\/?$/
const ARJONA_EXPORT_PATH = '/api/ricardo-arjona-submissions.csv'

function replaceEndpointPath(endpoint, pattern) {
  if (!endpoint || !pattern.test(endpoint)) return ''
  return endpoint.replace(pattern, ARJONA_EXPORT_PATH)
}

export function resolveArjonaCsvEndpoint() {
  const configuredExportEndpoint = import.meta.env.VITE_ARJONA_EXPORT_ENDPOINT?.trim()
  if (configuredExportEndpoint) return configuredExportEndpoint

  const submissionEndpoint = import.meta.env.VITE_ARJONA_SUBMISSION_ENDPOINT?.trim()
  const derivedSubmissionEndpoint = replaceEndpointPath(
    submissionEndpoint,
    ARJONA_SUBMISSION_PATH_PATTERN
  )
  if (derivedSubmissionEndpoint) return derivedSubmissionEndpoint

  const mainSubmissionEndpoint = (
    import.meta.env.VITE_SUBMISSION_ENDPOINT || import.meta.env.VITE_POWER_AUTOMATE_ENDPOINT
  )?.trim()
  const derivedMainEndpoint = replaceEndpointPath(
    mainSubmissionEndpoint,
    MAIN_SUBMISSION_PATH_PATTERN
  )
  if (derivedMainEndpoint) return derivedMainEndpoint

  if (import.meta.env.DEV) return 'http://localhost:3001/api/ricardo-arjona-submissions.csv'

  return ''
}

export function createArjonaCsvFilename(now = new Date()) {
  return createMexicoDatedCsvFilename(
    'club-charros-ricardo-arjona-pase-doble-2026-11-16',
    now
  )
}

export { ProtectedCsvDownloadError as ArjonaCsvDownloadError }

export function downloadArjonaCsv({
  token,
  endpoint = resolveArjonaCsvEndpoint(),
  now = new Date(),
  ...dependencies
}) {
  return downloadProtectedCsv({
    token,
    endpoint,
    filename: createArjonaCsvFilename(now),
    configurationMessage: 'La descarga de participantes de Ricardo Arjona no está configurada.',
    expectedColumns: [
      'submissionId',
      'timestamp',
      'campaignName',
      'source',
      'nombreCompleto',
      'eventoSeleccionado',
      'recomendacion',
      'aceptaAvisoPrivacidad',
      'aceptaComunicaciones',
      'privacyNoticeVersion',
      'consentTimestamp'
    ],
    schemaMessage: 'El archivo recibido no corresponde a las participaciones de Ricardo Arjona.',
    ...dependencies
  })
}
