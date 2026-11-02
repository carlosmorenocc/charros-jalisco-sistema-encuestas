import {
  createMexicoDatedCsvFilename,
  downloadProtectedCsv,
  ProtectedCsvDownloadError
} from '../../registros/admin/downloadProtectedCsv'

const SOFTBALL_SUBMISSION_PATH_PATTERN = /\/api\/softball-submit\/?$/
const MAIN_SUBMISSION_PATH_PATTERN = /\/api\/submit\/?$/
const SOFTBALL_EXPORT_PATH = '/api/softball-submissions.csv'

function replaceEndpointPath(endpoint, pattern) {
  if (!endpoint || !pattern.test(endpoint)) return ''
  return endpoint.replace(pattern, SOFTBALL_EXPORT_PATH)
}

export function resolveSoftballCsvEndpoint() {
  const configuredExportEndpoint = import.meta.env.VITE_SOFTBALL_EXPORT_ENDPOINT?.trim()
  if (configuredExportEndpoint) return configuredExportEndpoint

  const softballSubmissionEndpoint = import.meta.env.VITE_SOFTBALL_SUBMISSION_ENDPOINT?.trim()
  const derivedSoftballEndpoint = replaceEndpointPath(
    softballSubmissionEndpoint,
    SOFTBALL_SUBMISSION_PATH_PATTERN
  )
  if (derivedSoftballEndpoint) return derivedSoftballEndpoint

  const mainSubmissionEndpoint = (
    import.meta.env.VITE_SUBMISSION_ENDPOINT || import.meta.env.VITE_POWER_AUTOMATE_ENDPOINT
  )?.trim()
  const derivedMainEndpoint = replaceEndpointPath(
    mainSubmissionEndpoint,
    MAIN_SUBMISSION_PATH_PATTERN
  )
  if (derivedMainEndpoint) return derivedMainEndpoint

  if (import.meta.env.DEV) return 'http://localhost:3001/api/softball-submissions.csv'

  return ''
}

export function createSoftballCsvFilename(now = new Date()) {
  return createMexicoDatedCsvFilename(
    'club-charros-softbol-afiliados-2026-11-08',
    now
  )
}

export { ProtectedCsvDownloadError as SoftballCsvDownloadError }

export function downloadSoftballCsv({
  token,
  endpoint = resolveSoftballCsvEndpoint(),
  now = new Date(),
  ...dependencies
}) {
  return downloadProtectedCsv({
    token,
    endpoint,
    filename: createSoftballCsvFilename(now),
    configurationMessage: 'La descarga de participantes de sóftbol no está configurada.',
    expectedColumns: [
      'submissionId',
      'timestamp',
      'campaignName',
      'source',
      'nombreCompleto',
      'telefono',
      'cantidadAbonos',
      'eventoSeleccionado',
      'aceptaAvisoPrivacidad',
      'aceptaComunicaciones',
      'privacyNoticeVersion',
      'consentTimestamp'
    ],
    schemaMessage: 'El archivo recibido no corresponde a las participaciones de sóftbol.',
    ...dependencies
  })
}
