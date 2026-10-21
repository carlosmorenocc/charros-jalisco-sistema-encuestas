const PENDING_QUEUE_KEY = 'charros-rewards-pending'

function endpoint() {
  const configured = import.meta.env.VITE_REWARDS_SUBMISSION_ENDPOINT?.trim()
  if (configured) return configured
  const base = import.meta.env.VITE_SUBMISSION_ENDPOINT?.trim()
  if (base && /\/api\/submit\/?$/.test(base)) return base.replace(/\/api\/submit\/?$/, '/api/rewards-submit')
  return import.meta.env.DEV ? 'http://localhost:3001/api/rewards-submit' : ''
}

function enqueue(payload) {
  const previous = JSON.parse(localStorage.getItem(PENDING_QUEUE_KEY) || '[]')
  previous.push({ ...payload, queuedAt: new Date().toISOString() })
  localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(previous))
  return previous.length
}

export async function submitRewardsForm(payload) {
  const target = endpoint()
  if (!target) throw new Error('Rewards submission endpoint is not configured')

  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) throw new Error(`Rewards submit failed (${response.status})`)
    return await response.json()
  } catch (error) {
    if (import.meta.env.VITE_ENABLE_LOCAL_QUEUE !== 'false' && typeof window !== 'undefined') {
      return { ok: true, queuedLocally: true, pendingCount: enqueue(payload) }
    }
    throw error
  }
}
