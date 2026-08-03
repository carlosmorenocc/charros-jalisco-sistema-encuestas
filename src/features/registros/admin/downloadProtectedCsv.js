export class ProtectedCsvDownloadError extends Error {
  constructor(message, { code = 'unknown', status } = {}) {
    super(message)
    this.name = 'ProtectedCsvDownloadError'
    this.code = code
    this.status = status
  }
}

export function createMexicoDatedCsvFilename(prefix, now = new Date()) {
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
  return `${prefix}-${date}.csv`
}

function responseError(status) {
  if (status === 401) {
    return new ProtectedCsvDownloadError('La clave no es válida.', {
      code: 'unauthorized',
      status
    })
  }

  if (status === 403) {
    return new ProtectedCsvDownloadError('La clave no tiene permiso para esta descarga.', {
      code: 'forbidden',
      status
    })
  }

  if (status === 503) {
    return new ProtectedCsvDownloadError('El servicio de exportación no está disponible.', {
      code: 'unavailable',
      status
    })
  }

  return new ProtectedCsvDownloadError('No fue posible obtener el archivo.', {
    code: 'http-error',
    status
  })
}

export async function downloadProtectedCsv({
  token,
  endpoint,
  filename,
  configurationMessage = 'La descarga no está configurada.',
  expectedColumns = [],
  schemaMessage = 'El archivo recibido no corresponde a esta descarga.',
  fetchImpl = globalThis.fetch,
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  scheduleTask = (callback) => globalThis.setTimeout(callback, 0)
}) {
  const normalizedToken = token?.trim()

  if (!normalizedToken) {
    throw new ProtectedCsvDownloadError('Ingresa la clave de descarga.', {
      code: 'missing-token'
    })
  }

  if (!endpoint) {
    throw new ProtectedCsvDownloadError(configurationMessage, {
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
    throw new ProtectedCsvDownloadError(
      'No pudimos conectar con el servicio de exportación. Intenta nuevamente.',
      { code: 'network' }
    )
  }

  if (!response.ok) throw responseError(response.status)

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('csv')) {
    throw new ProtectedCsvDownloadError('El servicio respondió con un archivo no válido.', {
      code: 'invalid-response',
      status: response.status
    })
  }

  const csvText = await response.text()
  const headerLine = csvText.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0]
  const headerColumns = new Set(headerLine.split(',').map((column) => column.trim()))
  if (expectedColumns.some((column) => !headerColumns.has(column))) {
    throw new ProtectedCsvDownloadError(schemaMessage, {
      code: 'invalid-schema',
      status: response.status
    })
  }

  const csvWithBom = csvText.startsWith('\uFEFF') ? csvText : `\uFEFF${csvText}`
  const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8' })
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
