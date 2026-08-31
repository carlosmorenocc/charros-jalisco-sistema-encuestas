const DEFAULT_BASE_URL = '/api/v1'
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function resolveApiBaseUrl(env = import.meta.env) {
  const configured = String(env.VITE_API_BASE_URL || '').trim()
  if (env.PROD) {
    const productionPath = trimTrailingSlash(configured || DEFAULT_BASE_URL)
    if (productionPath !== DEFAULT_BASE_URL) {
      throw new Error('En producción VITE_API_BASE_URL debe ser /api/v1 para conservar cookies same-origin.')
    }
    return DEFAULT_BASE_URL
  }
  if (!configured) return DEFAULT_BASE_URL
  if (configured.startsWith('/') && !configured.startsWith('//')) return trimTrailingSlash(configured)
  let url
  try { url = new URL(configured) } catch { throw new Error('VITE_API_BASE_URL debe ser una ruta same-origin o una URL absoluta válida.') }
  return trimTrailingSlash(url.toString())
}

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status ?? 0
    this.code = options.code ?? 'UNKNOWN_ERROR'
    this.details = options.details ?? null
  }
}

function trimTrailingSlash(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

export function encodeQuery(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === '' || value === null || value === undefined) return
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item))
    else query.set(key, String(value))
  })
  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

export function createApiClient({
  baseUrl = DEFAULT_BASE_URL,
  getCsrfToken,
  onUnauthorized,
  onActivity,
  fetchImpl = fetch,
} = {}) {
  const root = trimTrailingSlash(baseUrl)

  async function request(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase()
    const headers = new Headers(options.headers)
    headers.set('Accept', 'application/json')
    if (options.body !== undefined) headers.set('Content-Type', 'application/json')
    if (UNSAFE_METHODS.has(method) && !options.skipCsrf) {
      const csrfToken = getCsrfToken?.()
      if (!csrfToken) {
        throw new ApiError('La sesión no cuenta con validación CSRF. Vuelve a iniciar sesión.', {
          status: 403,
          code: 'CSRF_TOKEN_MISSING',
        })
      }
      headers.set('X-CSRF-Token', csrfToken)
    }

    const { skipCsrf: _skipCsrf, notifyUnauthorized: _notifyUnauthorized, trackActivity: _trackActivity, ...fetchOptions } = options
    const response = await fetchImpl(`${root}${path}`, {
      ...fetchOptions,
      credentials: 'include',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })

    if (response.status === 401 && options.notifyUnauthorized !== false) onUnauthorized?.()
    const envelope = response.status === 204 ? {} : await response.json().catch(() => ({}))
    if (!response.ok || envelope.error) {
      const apiError = envelope.error || {}
      throw new ApiError(apiError.message || `La solicitud falló (${response.status})`, {
        status: response.status,
        code: apiError.code,
        details: apiError.details,
      })
    }
    if (options.trackActivity !== false) onActivity?.()
    return { data: envelope.data ?? null, meta: envelope.meta ?? {} }
  }

  async function requestBlob(path) {
    const response = await fetchImpl(`${root}${path}`, {
      credentials: 'include',
      headers: new Headers({ Accept: 'text/csv' }),
    })
    if (response.status === 401) onUnauthorized?.()
    if (!response.ok) {
      const envelope = await response.json().catch(() => ({}))
      throw new ApiError(envelope.error?.message || `La exportación falló (${response.status})`, {
        status: response.status,
        code: envelope.error?.code,
        details: envelope.error?.details,
      })
    }
    onActivity?.()
    return {
      blob: await response.blob(),
      filename: response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] || 'contactos-crm.csv',
    }
  }

  return {
    login: (credentials) => request('/auth/login', { method: 'POST', body: credentials, skipCsrf: true, notifyUnauthorized: false, trackActivity: false }),
    session: () => request('/auth/session', { notifyUnauthorized: false, trackActivity: false }),
    logout: () => request('/auth/logout', { method: 'POST', trackActivity: false }),
    dashboard: (filters) => request(`/dashboard/summary${encodeQuery(filters)}`),
    contacts: (filters) => request(`/contacts${encodeQuery(filters)}`),
    contact: (id, filters) => request(`/contacts/${encodeURIComponent(id)}${encodeQuery(filters)}`),
    createContact: (payload) => request('/contacts', { method: 'POST', body: payload }),
    createManualRegistration: (payload, idempotencyKey) => request('/manual-registrations', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: payload }),
    updateContact: (id, payload, rowVersion) => request(`/contacts/${encodeURIComponent(id)}`, { method: 'PATCH', headers: rowVersion == null ? {} : { 'If-Match': String(rowVersion) }, body: payload }),
    deleteContact: (id, { reason, rowVersion } = {}) => request(`/contacts/${encodeURIComponent(id)}`, { method: 'DELETE', headers: rowVersion == null ? {} : { 'If-Match': String(rowVersion) }, body: { reason } }),
    restoreContact: (id, rowVersion) => request(`/contacts/${encodeURIComponent(id)}/restore`, { method: 'POST', headers: rowVersion == null ? {} : { 'If-Match': String(rowVersion) }, body: {} }),
    interactions: (id, filters) => request(`/contacts/${encodeURIComponent(id)}/interactions${encodeQuery(filters)}`),
    createInteraction: (id, payload) => request(`/contacts/${encodeURIComponent(id)}/interactions`, { method: 'POST', body: payload }),
    allInteractions: (filters) => request(`/interactions${encodeQuery(filters)}`),
    contactTasks: (id, filters) => request(`/contacts/${encodeURIComponent(id)}/tasks${encodeQuery(filters)}`),
    createTask: (id, payload) => request(`/contacts/${encodeURIComponent(id)}/tasks`, { method: 'POST', body: payload }),
    memberships: (id) => request(`/contacts/${encodeURIComponent(id)}/memberships`),
    membershipPricingCatalog: () => request('/pricing/subscriptions/catalog'),
    membershipPricingQuote: (params) => request(`/pricing/subscriptions/quote${encodeQuery(params)}`),
    createMembership: (id, payload) => request(`/contacts/${encodeURIComponent(id)}/memberships`, { method: 'POST', body: payload }),
    updateMembership: (id, payload, rowVersion) => request(`/memberships/${encodeURIComponent(id)}`, { method: 'PATCH', headers: rowVersion == null ? {} : { 'If-Match': String(rowVersion) }, body: payload }),
    tasks: (filters) => request(`/tasks${encodeQuery(filters)}`),
    updateTask: (id, payload, rowVersion) => request(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', headers: rowVersion == null ? {} : { 'If-Match': String(rowVersion) }, body: payload }),
    sales: (filters) => request(`/sales${encodeQuery(filters)}`),
    createSale: (payload) => request('/sales', { method: 'POST', body: payload }),
    correctSale: (id, payload) => request(`/sales/${encodeURIComponent(id)}/corrections`, { method: 'POST', body: payload }),
    cancelSale: (id, reason) => request(`/sales/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: { reason } }),
    addPayment: (id, payload) => request(`/sales/${encodeURIComponent(id)}/payments`, { method: 'POST', body: payload }),
    executives: (filters = { active: true }) => request(`/executives${encodeQuery(filters)}`),
    exportContacts: (filters) => requestBlob(`/exports/contacts.csv${encodeQuery(filters)}`),
    recordDashboardPdfRequest: (filters) => request('/exports/dashboard-pdf-events', { method: 'POST', body: { filters } }),
  }
}
