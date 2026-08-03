import {
  createMexicoDatedCsvFilename,
  downloadProtectedCsv,
  ProtectedCsvDownloadError
} from './downloadProtectedCsv'

const LEAD_SUBMISSION_PATH_PATTERN = /\/api\/lead-submit\/?$/
const MAIN_SUBMISSION_PATH_PATTERN = /\/api\/submit\/?$/

function replaceEndpointPath(endpoint, pattern, replacement) {
  if (!endpoint || !pattern.test(endpoint)) return ''
  return endpoint.replace(pattern, replacement)
}

export function resolveRegistrosCsvEndpoint() {
  const configuredExportEndpoint = import.meta.env.VITE_REGISTRO_CORTO_EXPORT_ENDPOINT?.trim()
  if (configuredExportEndpoint) return configuredExportEndpoint

  const leadSubmissionEndpoint = import.meta.env.VITE_LEADS_SUBMISSION_ENDPOINT?.trim()
  const derivedLeadEndpoint = replaceEndpointPath(
    leadSubmissionEndpoint,
    LEAD_SUBMISSION_PATH_PATTERN,
    '/api/leads-submissions.csv'
  )
  if (derivedLeadEndpoint) return derivedLeadEndpoint

  const mainSubmissionEndpoint = (
    import.meta.env.VITE_SUBMISSION_ENDPOINT || import.meta.env.VITE_POWER_AUTOMATE_ENDPOINT
  )?.trim()
  const derivedMainEndpoint = replaceEndpointPath(
    mainSubmissionEndpoint,
    MAIN_SUBMISSION_PATH_PATTERN,
    '/api/leads-submissions.csv'
  )
  if (derivedMainEndpoint) return derivedMainEndpoint

  if (import.meta.env.DEV) return 'http://localhost:3001/api/leads-submissions.csv'

  return ''
}

export function createRegistrosCsvFilename(now = new Date()) {
  return createMexicoDatedCsvFilename('registros-cortos-oficiales-charros', now)
}

export { ProtectedCsvDownloadError as RegistrosCsvDownloadError }

export async function downloadRegistrosCsv({
  token,
  endpoint = resolveRegistrosCsvEndpoint(),
  now = new Date(),
  ...dependencies
}) {
  return downloadProtectedCsv({
    token,
    endpoint,
    filename: createRegistrosCsvFilename(now),
    configurationMessage: 'La descarga del registro corto no está configurada.',
    expectedColumns: ['frecuenciaVisita', 'aceptaRegistroDiario'],
    schemaMessage: 'El archivo recibido no corresponde al registro corto.',
    ...dependencies
  })
}
