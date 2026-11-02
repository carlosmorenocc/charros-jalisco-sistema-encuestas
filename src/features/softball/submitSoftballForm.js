function resolveSoftballEndpoint() {
  const configured = import.meta.env.VITE_SOFTBALL_SUBMISSION_ENDPOINT?.trim()
  if (configured) return configured

  const mainEndpoint = (
    import.meta.env.VITE_SUBMISSION_ENDPOINT
    || import.meta.env.VITE_POWER_AUTOMATE_ENDPOINT
    || ''
  ).trim()

  if (mainEndpoint && /\/api\/submit\/?$/.test(mainEndpoint)) {
    return mainEndpoint.replace(/\/api\/submit\/?$/, '/api/softball-submit')
  }

  if (import.meta.env.DEV) return 'http://localhost:3001/api/softball-submit'
  return ''
}

export async function submitSoftballForm(payload) {
  const endpoint = resolveSoftballEndpoint()

  if (!endpoint) {
    throw new Error('No softball submission endpoint configured')
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
