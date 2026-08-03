const SUBMISSION_PATH_PATTERN = /\/api\/submit\/?$/

function replaceEndpointPath(endpoint, pattern, replacement) {
  if (!endpoint || !pattern.test(endpoint)) return ''
  return endpoint.replace(pattern, replacement)
}

export function resolveRegistrosCsvEndpoint() {
  const configuredExportEndpoint = import.meta.env.VITE_REGISTROS_EXPORT_ENDPOINT?.trim()
  if (configuredExportEndpoint) return configuredExportEndpoint

  const submissionEndpoint = (
    import.meta.env.VITE_SUBMISSION_ENDPOINT || import.meta.env.VITE_POWER_AUTOMATE_ENDPOINT
  )?.trim()
  const derivedEndpoint = replaceEndpointPath(
    submissionEndpoint,
    SUBMISSION_PATH_PATTERN,
    '/api/submissions.csv'
  )
  if (derivedEndpoint) return derivedEndpoint

  if (import.meta.env.DEV) return 'http://localhost:3001/api/submissions.csv'

  return ''
}

export function createRegistrosCsvFilename(now = new Date()) {
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)
  const dateValues = Object.fromEntries(
    dateParts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value])
  )
  const date = `${dateValues.year}-${dateValues.month}-${dateValues.day}`
  return `registros-oficiales-charros-${date}.csv`
}

export class RegistrosCsvDownloadError extends Error {
  constructor(message, { code = 'unknown', status } = {}) {
    super(message)
    this.name = 'RegistrosCsvDownloadError'
    this.code = code
    this.status = status
  }
}

function responseError(status) {
  if (status === 401) {
    return new RegistrosCsvDownloadError('La clave no es válida.', {
      code: 'unauthorized',
      status
    })
  }

  if (status === 403) {
    return new RegistrosCsvDownloadError('La clave no tiene permiso para esta descarga.', {
      code: 'forbidden',
      status
    })
  }

  if (status === 503) {
    return new RegistrosCsvDownloadError('El servicio de exportación no está disponible.', {
      code: 'unavailable',
      status
    })
  }

  return new RegistrosCsvDownloadError('No fue posible obtener el archivo.', {
    code: 'http-error',
    status
  })
}

export async function downloadRegistrosCsv({
  token,
  endpoint = resolveRegistrosCsvEndpoint(),
  fetchImpl = globalThis.fetch,
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  scheduleTask = (callback) => globalThis.setTimeout(callback, 0),
  now = new Date()
}) {
  const normalizedToken = token?.trim()

  if (!normalizedToken) {
    throw new RegistrosCsvDownloadError('Ingresa la clave de descarga.', {
      code: 'missing-token'
    })
  }

  if (!endpoint) {
    throw new RegistrosCsvDownloadError('La descarga del Registro Oficial no está configurada.', {
      code: 'configuration'
    })
  }

  let response
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'text/csv',
        Authorization: `Bearer ${normalizedToken}`
      },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    })
  } catch {
    throw new RegistrosCsvDownloadError(
      'No pudimos conectar con el servicio de exportación. Intenta nuevamente.',
      { code: 'network' }
    )
  }

  if (!response.ok) throw responseError(response.status)

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('csv')) {
    throw new RegistrosCsvDownloadError('El servicio respondió con un archivo no válido.', {
      code: 'invalid-response',
      status: response.status
    })
  }

  const csvText = await response.text()
  const csvWithBom = csvText.startsWith('\uFEFF') ? csvText : `\uFEFF${csvText}`
  const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8' })
  const filename = createRegistrosCsvFilename(now)
  const objectUrl = urlApi.createObjectURL(blob)

  try {
    const link = documentRef.createElement('a')
    link.href = objectUrl
    link.download = filename
    link.rel = 'noopener'
    link.hidden = true
    documentRef.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    scheduleTask(() => urlApi.revokeObjectURL(objectUrl))
  }

  return filename
}
