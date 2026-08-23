const subscriberLabels = {
  prospect: 'Prospecto',
  current_subscriber: 'Abonado actual',
  renewing: 'Por renovar',
  new_subscriber: 'Abonado nuevo',
  former_subscriber: 'Exabonado',
}

const subscriberCodes = Object.fromEntries(Object.entries(subscriberLabels).map(([code, label]) => [label, code]))

const stageLabels = {
  unassigned: 'Sin asignar',
  to_contact: 'Por contactar',
  contacted: 'Contactado',
  follow_up: 'Seguimiento',
  interested: 'Interesado',
  reserved: 'Apartado',
  won: 'Ganado',
  lost: 'Perdido',
}

const stageCodes = Object.fromEntries(Object.entries(stageLabels).map(([code, label]) => [label, code]))

const consentLabels = { yes: 'Sí', no: 'No', unknown: 'No consta' }
const consentCodes = { Sí: 'yes', No: 'no', 'No consta': 'unknown' }
const channelLabels = { phone: 'Llamada', whatsapp: 'WhatsApp', email: 'Correo', in_person: 'Presencial', other: 'Otro' }
const businessSourceLabels = { season_ticket_database: 'Base de abonados', referral: 'Referido', box_office: 'Taquilla', digital: 'Registro digital', event: 'Evento o activación', outbound: 'Prospección del equipo', other: 'Otro origen' }
export const ACTIVE_SEASON = 'LMP-2026-27'
export const MEMBERSHIP_SECTIONS = Object.freeze(['VIP', 'Preferente', 'General'])

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function membershipMoney(record, field) {
  const direct = nullableNumber(record?.[field])
  if (direct != null) return direct
  const cents = nullableNumber(record?.[`${field}Cents`])
  return cents == null ? null : cents / 100
}

export function subscriberStatusCode(label) {
  return subscriberCodes[label] || label || undefined
}

export function commercialStageCode(label) {
  if (label === 'Sin contactar') return 'to_contact'
  return stageCodes[label] || label || undefined
}

function displayDate(value, emptyLabel) {
  if (!value) return emptyLabel
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
}

export function fromApiContact(contact) {
  if (contact.name && contact.type && !contact.firstName && !contact.subscriberStatus) return contact
  const name = (contact.displayName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim()).toLocaleUpperCase('es-MX')
  const hasMembershipSummary = Object.prototype.hasOwnProperty.call(contact, 'membershipId')
  const currentMembership = contact.membershipId ? fromApiMembership({
    id: contact.membershipId,
    seasonCode: ACTIVE_SEASON,
    membershipStatus: contact.membershipStatus,
    membershipSection: contact.membershipSection,
    seatCount: contact.membershipSeatCount,
    units: contact.membershipSeats || [],
    rowVersion: contact.membershipRowVersion,
    localityCode: contact.membershipLocalityCode,
    localityName: contact.membershipLocalityName,
    discountCode: contact.membershipDiscountCode,
    discountName: contact.membershipDiscountName,
    priceBookVersion: contact.membershipPriceBookVersion,
    currency: contact.membershipCurrency,
    pricingMode: contact.membershipPricingMode,
    listUnitPrice: contact.membershipListUnitPrice,
    commercialValue: contact.membershipCommercialValue,
    netAmount: contact.membershipNetAmount,
    discountAmount: contact.membershipDiscountAmount,
    effectiveUnitPrice: contact.membershipEffectiveUnitPrice,
    chargedUnits: contact.membershipChargedUnits,
    bonusUnits: contact.membershipBonusUnits,
  }) : null
  return {
    ...contact,
    name,
    initials: initials(name),
    type: subscriberLabels[contact.subscriberStatus] || contact.subscriberStatus || 'Prospecto',
    stage: stageLabels[contact.commercialStage] || contact.commercialStage || 'Sin asignar',
    seasons: Number(contact.seasonsCount || 0),
    declaredSeasons: contact.declaredTenureSeasons == null ? null : Number(contact.declaredTenureSeasons),
    seats: Number(contact.managedSeatCount ?? contact.seatCount ?? 0),
    zone: contact.zoneName || 'Sin definir',
    lastContact: displayDate(contact.lastHumanContactAt, 'Sin contacto humano'),
    nextTask: displayDate(contact.nextTaskAt || contact.nextFollowUpAt, 'Sin tarea'),
    channel: channelLabels[contact.lastHumanContactChannel] || '—',
    executive: contact.executiveName || 'Sin asignar',
    note: contact.summaryNotes || '',
    consent: consentLabels[contact.consentStatus] || 'No consta',
    businessSourceLabel: businessSourceLabels[contact.businessSource || contact.acquisitionSource] || 'No consta',
    kind: contact.subscriberStatus === 'prospect' ? 'prospect' : 'portfolio',
    ...(hasMembershipSummary ? { currentMembership } : {}),
  }
}

export function membershipStatusForContact(contact = {}) {
  const status = contact.subscriberStatus || contact.type
  if (['current_subscriber', 'new_subscriber', 'Abonado actual', 'Abonado nuevo'].includes(status)) return 'active'
  if (['renewing', 'Por renovar'].includes(status)) return 'renewing'
  if (['former_subscriber', 'Exabonado'].includes(status)) return 'expired'
  return null
}

export function fromApiMembership(membership) {
  if (!membership) return null
  const units = (Array.isArray(membership.units) ? membership.units : [])
    .map((unit, index) => typeof unit === 'string' || unit == null
      ? { unitNumber: index + 1, seatIdentifier: unit || '' }
      : { ...unit, unitNumber: Number(unit.unitNumber ?? index + 1), seatIdentifier: unit.seatIdentifier || '' })
    .sort((left, right) => left.unitNumber - right.unitNumber)
  return {
    ...membership,
    membershipSection: membership.membershipSection ?? membership.section ?? null,
    seatCount: Number(membership.seatCount ?? units.length ?? 0),
    units,
    rowVersion: membership.rowVersion == null ? null : Number(membership.rowVersion),
    priceBookVersion: membership.priceBookVersion || membership.pricingCode || null,
    currency: membership.currency || membership.pricingCurrency || 'MXN',
    listUnitPrice: membershipMoney(membership, 'listUnitPrice'),
    commercialValue: membershipMoney(membership, 'commercialValue'),
    netAmount: membershipMoney(membership, 'netAmount'),
    discountAmount: membershipMoney(membership, 'discountAmount'),
    effectiveUnitPrice: membershipMoney(membership, 'effectiveUnitPrice'),
    chargedUnits: nullableNumber(membership.chargedUnits),
    bonusUnits: nullableNumber(membership.bonusUnits),
  }
}

export function currentSeasonMembership(memberships = [], seasonCode = ACTIVE_SEASON) {
  return memberships.map(fromApiMembership).find((membership) => membership?.seasonCode === seasonCode) || null
}

export function resizeMembershipUnits(current = [], count = 1) {
  const safeCount = Math.min(20, Math.max(1, Number(count) || 1))
  return Array.from({ length: safeCount }, (_, index) => ({
    ...(current[index] || {}),
    unitNumber: index + 1,
    seatIdentifier: current[index]?.seatIdentifier || '',
  }))
}

export function toApiMembershipPayload(draft, { contact, membership, today = new Date() } = {}) {
  const membershipStatus = membership?.membershipStatus || membershipStatusForContact(contact)
  const units = resizeMembershipUnits(draft.units, draft.seatCount).map((unit, index) => ({
    unitNumber: index + 1,
    seatIdentifier: String(unit.seatIdentifier || '').trim(),
  }))
  const payload = {
    section: draft.membershipSection,
    ...(draft.localityCode ? { localityCode: draft.localityCode } : {}),
    ...(draft.discountCode ? { discountCode: draft.discountCode } : {}),
    seatCount: units.length,
    units,
  }
  if (membership) return payload
  payload.seasonCode = ACTIVE_SEASON
  payload.membershipStatus = membershipStatus
  if (membershipStatus === 'active') payload.startDate = today.toISOString()
  return payload
}

export function toApiContactPayload(form) {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    municipality: form.municipality?.trim() || null,
    subscriberStatus: subscriberStatusCode(form.type),
    commercialStage: commercialStageCode(form.stage),
    preferredChannel: form.preferredChannel || null,
    executiveId: form.executiveId || null,
    consentStatus: consentCodes[form.consent] || 'unknown',
    source: form.source || 'crm_manual',
    summaryNotes: form.note.trim() || null,
  }
}

export function fromApiTask(task) {
  if (task.action) return task
  const dueAt = task.dueAt ? new Date(task.dueAt) : null
  const isOverdue = dueAt && dueAt.getTime() < Date.now() && ['pending', 'in_progress'].includes(task.status)
  return {
    ...task,
    time: task.dueAt ? new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date(task.dueAt)) : 'Sin fecha',
    contact: task.contactName || 'Contacto',
    action: task.description,
    owner: task.assigneeName || 'Sin asignar',
    status: isOverdue ? 'Vencida' : ({ pending: 'Pendiente', in_progress: 'En curso', completed: 'Completada', cancelled: 'Cancelada' })[task.status] || task.status,
    priority: ({ urgent: 'Alta', high: 'Alta', normal: 'Media', medium: 'Media', low: 'Baja' })[task.priority] || task.priority,
  }
}

export function fromApiSale(sale) {
  if (sale.contact) return sale
  const seats = (sale.items || []).reduce((sum, item) => sum + Number(item.quantity || item.seatCount || 0), 0)
  const total = Number(sale.totalAmount || 0)
  const paid = Number(sale.paidAmount || 0)
  const paymentStatus = paid <= 0 ? 'Pendiente' : paid < total ? 'Parcial' : 'Pagado'
  const commercialStatus = ({ draft: 'Borrador', reserved: 'Apartada', confirmed: 'Confirmada', cancelled: 'Cancelada', refunded: 'Reembolsada' })[sale.status] || sale.status || 'Sin definir'
  const product = String(sale.items?.[0]?.product || '').toUpperCase()
  const rawZone = sale.items?.[0]?.zone || sale.items?.[0]?.zoneName || 'Sin definir'
  const explicitTwoForOne = (sale.items || []).some((item) => String(item.product || '').toUpperCase().includes('2X1'))
  const inferredLegacyTwoForOne = /LATERAL.*1.*3/i.test(rawZone)
    && (sale.items || []).length === 1
    && Math.abs(Number(sale.items?.[0]?.unitPrice || 0) - 3740) < 0.01
  const promotion = explicitTwoForOne || inferredLegacyTwoForOne ? 'Promoción 2x1' : ''
  const movementKind = product.includes('RENOV') ? 'Renovación' : product.includes('ABONO') ? 'Nuevo' : '—'
  return {
    ...sale,
    date: sale.soldAt ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(sale.soldAt)) : 'Sin fecha',
    contact: sale.contactName || 'Contacto',
    kind: sale.saleType === 'renewal' ? 'Renovación' : sale.saleType === 'new' ? 'Nuevo' : movementKind,
    zone: promotion ? `${rawZone} · ${promotion}` : rawZone,
    promotion,
    seats,
    total,
    paid,
    owner: sale.executiveName || 'Sin asignar',
    status: paymentStatus,
    commercialStatus,
  }
}

export function fromApiInteraction(interaction) {
  return {
    ...interaction,
    when: displayDate(interaction.occurredAt, 'Sin fecha'),
    contact: interaction.contactName || 'Contacto',
    type: interaction.channel || 'Otro',
    result: interaction.outcome || 'Registrado',
    owner: interaction.actorName || 'Usuario',
    detail: interaction.notes || '',
  }
}

export function fromApiUser(payload) {
  const user = payload?.user || payload || {}
  const roleLabels = { admin: 'Administrador', supervisor: 'Supervisor', executive: 'Ejecutivo', direction: 'Dirección' }
  return {
    ...user,
    name: user.name || user.displayName || 'Usuario',
    role: roleLabels[user.role] || user.role || 'Usuario',
    roleCode: user.role,
    permissions: payload?.permissions || payload?.effectivePermissions || user.permissions || [],
  }
}
