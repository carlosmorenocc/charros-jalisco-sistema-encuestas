const ARJONA_SUBMISSION_PATH_PATTERN = /\/api\/ricardo-arjona-submit\/?$/
const MAIN_SUBMISSION_PATH_PATTERN = /\/api\/submit\/?$/
const ARJONA_SUBMISSION_PATH = '/api/ricardo-arjona-submit'

function replaceEndpointPath(endpoint, pattern) {
  if (!endpoint || !pattern.test(endpoint)) return ''
  return endpoint.replace(pattern, ARJONA_SUBMISSION_PATH)
}

export function resolveArjonaSubmissionEndpoint() {
  const configuredEndpoint = import.meta.env.VITE_ARJONA_SUBMISSION_ENDPOINT?.trim()
  if (configuredEndpoint) return configuredEndpoint

  const mainSubmissionEndpoint = (
    import.meta.env.VITE_SUBMISSION_ENDPOINT || import.meta.env.VITE_POWER_AUTOMATE_ENDPOINT
  )?.trim()
  const derivedEndpoint = replaceEndpointPath(
    mainSubmissionEndpoint,
    MAIN_SUBMISSION_PATH_PATTERN
  )
  if (derivedEndpoint) return derivedEndpoint

  if (import.meta.env.DEV) return `http://localhost:3001${ARJONA_SUBMISSION_PATH}`
  return ''
}

export class ArjonaSubmissionError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'ArjonaSubmissionError'
    this.status = status
  }
}

async function readResponseBody(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

export async function submitArjonaForm(payload) {
  const target = resolveArjonaSubmissionEndpoint()
  if (!target) {
    throw new ArjonaSubmissionError('El registro de Ricardo Arjona no está configurado.')
  }

  const response = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const body = await readResponseBody(response)

  if (!response.ok) {
    const defaultMessage = response.status === 410
      ? 'El registro para Ricardo Arjona ya cerró.'
      : 'No pudimos guardar tu participación. Inténtalo nuevamente.'
    throw new ArjonaSubmissionError(body.detail || body.error || defaultMessage, response.status)
  }

  return body
}
