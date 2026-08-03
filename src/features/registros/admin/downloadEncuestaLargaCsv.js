import {
  createMexicoDatedCsvFilename,
  downloadProtectedCsv,
  ProtectedCsvDownloadError
} from './downloadProtectedCsv'

const MAIN_SUBMISSION_PATH_PATTERN = /\/api\/submit\/?$/

function replaceEndpointPath(endpoint, pattern, replacement) {
  if (!endpoint || !pattern.test(endpoint)) return ''
  return endpoint.replace(pattern, replacement)
}

export function resolveEncuestaLargaCsvEndpoint() {
  const configuredExportEndpoint = import.meta.env.VITE_ENCUESTA_LARGA_EXPORT_ENDPOINT?.trim()
  if (configuredExportEndpoint) return configuredExportEndpoint

  const mainSubmissionEndpoint = (
    import.meta.env.VITE_SUBMISSION_ENDPOINT || import.meta.env.VITE_POWER_AUTOMATE_ENDPOINT
  )?.trim()
  const derivedEndpoint = replaceEndpointPath(
    mainSubmissionEndpoint,
    MAIN_SUBMISSION_PATH_PATTERN,
    '/api/submissions.csv'
  )
  if (derivedEndpoint) return derivedEndpoint

  if (import.meta.env.DEV) return 'http://localhost:3001/api/submissions.csv'

  return ''
}

export function createEncuestaLargaCsvFilename(now = new Date()) {
  return createMexicoDatedCsvFilename('encuesta-larga-charros', now)
}

export { ProtectedCsvDownloadError as EncuestaLargaCsvDownloadError }

export async function downloadEncuestaLargaCsv({
  token,
  endpoint = resolveEncuestaLargaCsvEndpoint(),
  now = new Date(),
  ...dependencies
}) {
  return downloadProtectedCsv({
    token,
    endpoint,
    filename: createEncuestaLargaCsvFilename(now),
    configurationMessage: 'La descarga de la encuesta larga no está configurada.',
    expectedColumns: ['myCashlessId', 'calificacionExperiencia'],
    schemaMessage: 'El archivo recibido no corresponde a la encuesta larga.',
    ...dependencies
  })
}
