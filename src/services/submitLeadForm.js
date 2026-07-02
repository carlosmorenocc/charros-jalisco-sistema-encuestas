const PENDING_QUEUE_KEY = 'charros-leads-pending'

function readPendingQueue() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PENDING_QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (error) {
    console.warn('Unable to read leads pending queue', error)
    return []
  }
}

function writePendingQueue(items) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(items))
}

function queueSubmission(payload) {
  const queue = readPendingQueue()
  queue.push({ ...payload, queuedAt: new Date().toISOString() })
  writePendingQueue(queue)
  return queue.length
}

async function flushPendingQueue(endpoint) {
  if (typeof window === 'undefined') return
  const queue = readPendingQueue()
  if (!queue.length) return

  const remaining = []
  for (const item of queue) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
    } catch (error) {
      remaining.push(item)
      console.warn('Unable to flush queued lead submission', error)
    }
  }

  writePendingQueue(remaining)
}

function resolveLeadsEndpoint() {
  const configured = import.meta.env.VITE_LEADS_SUBMISSION_ENDPOINT
  if (configured) return configured

  const mainEndpoint = import.meta.env.VITE_SUBMISSION_ENDPOINT || import.meta.env.VITE_POWER_AUTOMATE_ENDPOINT
  if (mainEndpoint && /\/api\/submit\/?$/.test(mainEndpoint)) {
    return mainEndpoint.replace(/\/api\/submit\/?$/, '/api/lead-submit')
  }

  if (import.meta.env.DEV) return 'http://localhost:3001/api/lead-submit'
  return ''
}

export async function submitLeadForm(payload) {
  const endpoint = resolveLeadsEndpoint()
  const localQueueEnabled = import.meta.env.VITE_ENABLE_LOCAL_QUEUE !== 'false'

  if (endpoint) {
    try {
      await flushPendingQueue(endpoint)
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const txt = await res.text().catch(() => null)
        throw new Error(`Lead submit failed (${res.status}): ${txt || 'unknown error'}`)
      }

      return res.json?.() ?? { ok: true }
    } catch (error) {
      if (localQueueEnabled && typeof window !== 'undefined') {
        const pendingCount = queueSubmission(payload)
        console.warn('Remote lead submission failed. Stored locally for retry.', error)
        return { ok: true, queuedLocally: true, pendingCount }
      }
      throw error
    }
  }

  if (localQueueEnabled && typeof window !== 'undefined') {
    const pendingCount = queueSubmission(payload)
    console.warn('No leads endpoint configured. Stored locally for later sync.', pendingCount)
    return { ok: true, queuedLocally: true, pendingCount }
  }

  throw new Error('No leads submission endpoint configured')
}
