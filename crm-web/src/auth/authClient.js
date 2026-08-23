const authMode = String(import.meta.env.VITE_AUTH_MODE || 'local').trim().toLowerCase()
const demoRequested = authMode === 'demo'
const demoMode = demoRequested && import.meta.env.DEV && !import.meta.env.PROD
const listeners = new Set()

let currentSession = null
let idleWindowMs = 0

function configurationProblem() {
  if (!['demo', 'local'].includes(authMode)) return 'VITE_AUTH_MODE debe ser "local" o "demo".'
  if (demoRequested && import.meta.env.PROD) return 'El modo demo está deshabilitado en compilaciones de producción.'
  return ''
}

function validDate(value) {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function emit(reason) {
  const snapshot = authClient.getSession()
  listeners.forEach((listener) => listener({ reason, session: snapshot }))
}

export const authClient = {
  isDemo: demoMode,
  configurationError: configurationProblem(),

  setSession(payload) {
    const expiresAt = validDate(payload?.expiresAt)
    const idleExpiresAt = validDate(payload?.idleExpiresAt)
    if (!payload?.user || typeof payload?.csrfToken !== 'string' || !expiresAt || !idleExpiresAt) {
      throw new Error('El API devolvió una sesión incompleta.')
    }
    const now = Date.now()
    idleWindowMs = Math.max(0, idleExpiresAt - now)
    currentSession = {
      user: payload.user,
      csrfToken: payload.csrfToken,
      expiresAt: new Date(expiresAt).toISOString(),
      idleExpiresAt: new Date(Math.min(expiresAt, idleExpiresAt)).toISOString(),
    }
    emit('session')
    return this.getSession()
  },

  getSession() {
    return currentSession ? { ...currentSession, user: { ...currentSession.user } } : null
  },

  getCsrfToken() {
    return currentSession?.csrfToken || ''
  },

  touchSession(now = Date.now()) {
    if (!currentSession || !idleWindowMs) return ''
    const absoluteExpiry = validDate(currentSession.expiresAt)
    if (!absoluteExpiry) return ''
    const nextIdleExpiry = Math.min(absoluteExpiry, now + idleWindowMs)
    currentSession = { ...currentSession, idleExpiresAt: new Date(nextIdleExpiry).toISOString() }
    emit('activity')
    return currentSession.idleExpiresAt
  },

  clearSession(reason = 'signed-out') {
    currentSession = null
    idleWindowMs = 0
    emit(reason)
  },

  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
