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
  const name = contact.displayName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
  return {
    ...contact,
    name,
    initials: initials(name),
    type: subscriberLabels[contact.subscriberStatus] || contact.subscriberStatus || 'Prospecto',
    stage: stageLabels[contact.commercialStage] || contact.commercialStage || 'Sin asignar',
    seasons: Number(contact.seasonsCount || 0),
    declaredSeasons: contact.declaredTenureSeasons == null ? null : Number(contact.declaredTenureSeasons),
    seats: Number(contact.managedSeatCount ?? contact.seatCount ?? 0),
    zone: contact.zoneName || contact.municipality || 'Sin definir',
    lastContact: displayDate(contact.lastHumanContactAt, 'Sin contacto humano'),
    nextTask: displayDate(contact.nextTaskAt || contact.nextFollowUpAt, 'Sin tarea'),
    channel: channelLabels[contact.lastHumanContactChannel] || '—',
    executive: contact.executiveName || 'Sin asignar',
    note: contact.summaryNotes || '',
    consent: consentLabels[contact.consentStatus] || 'No consta',
    businessSourceLabel: businessSourceLabels[contact.businessSource || contact.acquisitionSource] || 'No consta',
    kind: contact.subscriberStatus === 'prospect' ? 'prospect' : 'portfolio',
  }
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
  return {
    ...sale,
    date: sale.soldAt ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(sale.soldAt)) : 'Sin fecha',
    contact: sale.contactName || 'Contacto',
    kind: sale.saleType === 'renewal' ? 'Renovación' : sale.saleType === 'new' ? 'Nuevo' : '—',
    zone: sale.items?.[0]?.zone || sale.items?.[0]?.zoneName || 'Sin definir',
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
