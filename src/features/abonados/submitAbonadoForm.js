function resolveAbonadosEndpoint() {
  const configured = import.meta.env.VITE_ABONADOS_SUBMISSION_ENDPOINT
  if (configured) return configured

  const mainEndpoint = import.meta.env.VITE_SUBMISSION_ENDPOINT || import.meta.env.VITE_POWER_AUTOMATE_ENDPOINT
  if (mainEndpoint && /\/api\/submit\/?$/.test(mainEndpoint)) {
    return mainEndpoint.replace(/\/api\/submit\/?$/, '/api/abonados-lmp-submit')
  }

  if (import.meta.env.DEV) return 'http://localhost:3001/api/abonados-lmp-submit'
  return ''
}

export async function submitAbonadoForm(payload) {
  const endpoint = resolveAbonadosEndpoint()

  if (!endpoint) {
    throw new Error('No abonados submission endpoint configured')
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  const responseText = await response.text().catch(() => '')
  let responseBody = null

  if (responseText) {
    try {
      responseBody = JSON.parse(responseText)
    } catch {
      responseBody = null
    }
  }

  if (!response.ok) {
    const error = new Error(responseBody?.detail || responseBody?.error || `HTTP ${response.status}`)
    error.status = response.status
    throw error
  }

  return responseBody || { ok: true }
}
