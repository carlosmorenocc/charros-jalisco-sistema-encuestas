export const ACTIVE_SEASON = 'LMP-2026-27'
export const JERSEY_SIZES = Object.freeze(['S', 'M', 'L', 'XL', '2XL'])

export function classificationHasMembership(subscriberStatus) {
  return subscriberStatus !== 'prospect'
}

export function resizeJerseySizes(current, count) {
  const safeCount = Math.min(20, Math.max(1, Number(count) || 1))
  return Array.from({ length: safeCount }, (_, index) => current[index] || '')
}

function optional(value) {
  const normalized = String(value || '').trim()
  return normalized || undefined
}

function localDateToIso(value) {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString()
}

export function buildManualRegistrationPayload(draft, { actorId, mayAssignContact, mayAssignTask }) {
  const hasMembership = classificationHasMembership(draft.subscriberStatus)
  const declaredTenure = draft.declaredTenureSeasons === '' ? null : Number(draft.declaredTenureSeasons)
  const contact = {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    email: optional(draft.email),
    phone: optional(draft.phone),
    municipality: optional(draft.municipality),
    subscriberStatus: draft.subscriberStatus,
    commercialStage: draft.commercialStage,
    preferredChannel: optional(draft.preferredChannel),
    executiveId: mayAssignContact ? optional(draft.executiveId) : actorId,
    businessSource: draft.businessSource,
    declaredTenureSeasons: declaredTenure,
  }
  const membership = hasMembership ? {
    seatCount: Number(draft.seatCount),
    zone: optional(draft.zone),
    product: optional(draft.product),
    startDate: ['current_subscriber', 'new_subscriber'].includes(draft.subscriberStatus) ? localDateToIso(draft.startDate) : undefined,
    renewalDate: draft.subscriberStatus === 'renewing' ? localDateToIso(draft.renewalDate) : undefined,
    units: resizeJerseySizes(draft.jerseySizes, draft.seatCount).map((jerseySize, index) => ({
      unitNumber: index + 1,
      zone: optional(draft.zone),
      product: optional(draft.product),
      jerseySize: optional(jerseySize),
    })),
  } : null
  const nextTask = draft.scheduleTask ? {
    assignedTo: mayAssignTask ? optional(draft.taskAssignedTo) : actorId,
    description: draft.taskDescription.trim(),
    dueAt: new Date(draft.taskDueAt).toISOString(),
    priority: draft.taskPriority,
  } : undefined

  const cleanMembership = membership ? Object.fromEntries(Object.entries({
    ...membership,
    units: membership.units.map((unit) => Object.fromEntries(Object.entries(unit).filter(([, value]) => value !== undefined))),
  }).filter(([, value]) => value !== undefined)) : null

  return {
    contact: Object.fromEntries(Object.entries(contact).filter(([, value]) => value !== undefined)),
    consent: { status: draft.consentStatus || 'unknown' },
    initialObservation: { notes: draft.initialObservation.trim() },
    membership: cleanMembership,
    ...(nextTask ? { nextTask: Object.fromEntries(Object.entries(nextTask).filter(([, value]) => value !== undefined)) } : {}),
  }
}

export function duplicateContactId(error) {
  const matches = error?.status === 409 && error?.code === 'DUPLICATE_CONTACT' && Array.isArray(error.details?.matches) ? error.details.matches : []
  return matches.length === 1 && matches[0]?.id && !matches[0].deleted ? matches[0].id : ''
}
