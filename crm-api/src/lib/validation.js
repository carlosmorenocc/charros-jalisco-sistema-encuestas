import { badRequest } from './errors.js';

export const CONTACT_STATUSES = Object.freeze([
  'current_subscriber',
  'renewing',
  'new_subscriber',
  'former_subscriber',
  'prospect'
]);

export const CONTACT_SEGMENTS = Object.freeze(['portfolio', 'prospect']);
export const CONTACT_ASSIGNMENTS = Object.freeze(['assigned', 'unassigned']);
export const CONTACT_DATE_FIELDS = Object.freeze(['updatedAt', 'lastContact', 'nextFollowUp']);
export const SEASON_CODES = Object.freeze(['LMP-2026-27']);

export const COMMERCIAL_STAGES = Object.freeze([
  'unassigned',
  'to_contact',
  'contacted',
  'follow_up',
  'interested',
  'reserved',
  'won',
  'lost'
]);

export const CHANNELS = Object.freeze([
  'phone',
  'whatsapp',
  'email',
  'in_person',
  'other'
]);

const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];
const TASK_STATES = ['open', 'completed', 'cancelled'];
const SALE_STATUSES = ['draft', 'reserved', 'confirmed', 'cancelled', 'refunded'];
const CONSENT_STATUSES = ['yes', 'no', 'unknown'];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value, { required = false, max = 500, field = 'valor' } = {}) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw badRequest(`${field} debe ser texto.`);
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (required && !cleaned) throw badRequest(`${field} es obligatorio.`);
  if (cleaned.length > max) throw badRequest(`${field} excede ${max} caracteres.`);
  return cleaned || null;
}

function enumValue(value, values, field, { required = false } = {}) {
  if (value === undefined && !required) return undefined;
  if (!values.includes(value)) {
    throw badRequest(`${field} contiene un valor no permitido.`, { allowed: values });
  }
  return value;
}

function canonicalSeason(value, { required = false, field = 'seasonCode' } = {}) {
  const cleaned = cleanString(value, { required, max: 30, field });
  if (cleaned === undefined || cleaned === null) return cleaned;
  return enumValue(cleaned, SEASON_CODES, field, { required });
}

function uuid(value, field, { required = false } = {}) {
  if (value === undefined && !required) return undefined;
  if (value === null && !required) return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw badRequest(`${field} debe ser un UUID válido.`);
  }
  return value.toLowerCase();
}

function isoDate(value, field, { required = false } = {}) {
  if (value === undefined && !required) return undefined;
  if (value === null && !required) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw badRequest(`${field} debe ser una fecha ISO válida.`);
  }
  return new Date(value).toISOString();
}

function integer(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, required = false } = {}) {
  if (value === undefined && !required) return undefined;
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw badRequest(`${field} debe ser un entero entre ${min} y ${max}.`);
  }
  return parsed;
}

function decimal(value, field, { min = 0, required = false } = {}) {
  if (value === undefined && !required) return undefined;
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (!Number.isFinite(parsed) || parsed < min) {
    throw badRequest(`${field} debe ser un número mayor o igual a ${min}.`);
  }
  return parsed;
}

function email(value, field = 'email') {
  const cleaned = cleanString(value, { max: 254, field });
  if (cleaned == null) return cleaned;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    throw badRequest(`${field} no es válido.`);
  }
  return cleaned.toLowerCase();
}

function phone(value) {
  const cleaned = cleanString(value, { max: 30, field: 'phone' });
  if (cleaned == null) return cleaned;
  const compact = cleaned.replace(/[\s().-]/g, '');
  if (!/^\+?\d{8,15}$/.test(compact)) {
    throw badRequest('phone debe contener entre 8 y 15 dígitos.');
  }
  return compact;
}

function pickDefined(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

export function validateUuid(value, field = 'id') {
  return uuid(value, field, { required: true });
}

export function validateContact(input, { partial = false } = {}) {
  if (!isObject(input)) throw badRequest('El cuerpo del contacto debe ser un objeto.');
  const result = pickDefined({
    firstName: cleanString(input.firstName, { required: !partial, max: 100, field: 'firstName' }),
    lastName: cleanString(input.lastName, { required: !partial, max: 140, field: 'lastName' }),
    email: email(input.email),
    phone: phone(input.phone),
    municipality: cleanString(input.municipality, { max: 120, field: 'municipality' }),
    subscriberStatus: enumValue(input.subscriberStatus, CONTACT_STATUSES, 'subscriberStatus', { required: !partial }),
    commercialStage: enumValue(input.commercialStage, COMMERCIAL_STAGES, 'commercialStage', { required: !partial }),
    preferredChannel: input.preferredChannel === null ? null : enumValue(input.preferredChannel, CHANNELS, 'preferredChannel'),
    executiveId: uuid(input.executiveId, 'executiveId'),
    source: cleanString(input.source, { max: 120, field: 'source' }),
    consentStatus: input.consentStatus === undefined ? undefined : enumValue(input.consentStatus, CONSENT_STATUSES, 'consentStatus'),
    consentAt: isoDate(input.consentAt, 'consentAt'),
    privacyNoticeVersion: cleanString(input.privacyNoticeVersion, { max: 80, field: 'privacyNoticeVersion' }),
    summaryNotes: cleanString(input.summaryNotes, { max: 4000, field: 'summaryNotes' })
  });

  if (partial && Object.keys(result).length === 0) {
    throw badRequest('No se proporcionaron campos editables.');
  }
  if (!partial && !result.email && !result.phone) {
    throw badRequest('Se requiere al menos email o phone.');
  }
  return result;
}

export function validateInteraction(input) {
  if (!isObject(input)) throw badRequest('El cuerpo de la interacción debe ser un objeto.');
  return pickDefined({
    occurredAt: isoDate(input.occurredAt, 'occurredAt') ?? new Date().toISOString(),
    channel: enumValue(input.channel, CHANNELS, 'channel', { required: true }),
    outcome: cleanString(input.outcome, { required: true, max: 100, field: 'outcome' }),
    notes: cleanString(input.notes, { required: true, max: 5000, field: 'notes' }),
    isHumanContact: input.isHumanContact === undefined
      ? true
      : (() => {
          if (typeof input.isHumanContact !== 'boolean') throw badRequest('isHumanContact debe ser booleano.');
          return input.isHumanContact;
        })()
  });
}

export function validateTask(input, { partial = false } = {}) {
  if (!isObject(input)) throw badRequest('El cuerpo de la tarea debe ser un objeto.');
  const result = pickDefined({
    assignedTo: uuid(input.assignedTo, 'assignedTo', { required: !partial }),
    dueAt: isoDate(input.dueAt, 'dueAt', { required: !partial }),
    status: enumValue(input.status, TASK_STATUSES, 'status'),
    priority: input.priority === undefined ? undefined : enumValue(input.priority, ['low', 'normal', 'high', 'urgent'], 'priority'),
    description: cleanString(input.description, { required: !partial, max: 2000, field: 'description' })
  });
  if (partial && Object.keys(result).length === 0) throw badRequest('No se proporcionaron campos editables.');
  return result;
}

export function validateMembership(input) {
  if (!isObject(input)) throw badRequest('El cuerpo del abono debe ser un objeto.');
  const result = pickDefined({
    seasonCode: canonicalSeason(input.seasonCode, { required: true }),
    membershipStatus: enumValue(input.membershipStatus, ['active', 'renewing', 'expired', 'cancelled'], 'membershipStatus', { required: true }),
    seatCount: integer(input.seatCount ?? 1, 'seatCount', { min: 1, max: 100, required: true }),
    seatIdentifier: cleanString(input.seatIdentifier, { max: 100, field: 'seatIdentifier' }),
    zone: cleanString(input.zone, { max: 120, field: 'zone' }),
    product: cleanString(input.product, { max: 160, field: 'product' }),
    startDate: input.startDate == null ? input.startDate : isoDate(input.startDate, 'startDate'),
    renewalDate: input.renewalDate == null ? input.renewalDate : isoDate(input.renewalDate, 'renewalDate')
  });
  const units = Array.isArray(input.units) ? input.units.map((unit, index) => ({
    unitNumber: integer(unit.unitNumber ?? index + 1, `units[${index}].unitNumber`, { min: 1, max: 100, required: true }),
    seatIdentifier: cleanString(unit.seatIdentifier, { max: 100, field: `units[${index}].seatIdentifier` }),
    zone: cleanString(unit.zone, { max: 120, field: `units[${index}].zone` }),
    product: cleanString(unit.product, { max: 160, field: `units[${index}].product` }),
    jerseySize: unit.jerseySize == null ? unit.jerseySize : enumValue(unit.jerseySize, ['S', 'M', 'L', 'XL', '2XL'], `units[${index}].jerseySize`)
  })) : [];
  if (new Set(units.map((unit) => unit.unitNumber)).size !== units.length) {
    throw badRequest('Cada unitNumber debe ser único dentro del abono.');
  }
  if (units.length !== result.seatCount) {
    throw badRequest('La cantidad de units debe coincidir con seatCount.');
  }
  if (result.membershipStatus === 'active' && !result.startDate) {
    throw badRequest('startDate es obligatoria para un abono activo.');
  }
  return { ...result, units };
}

export function validateSale(input) {
  if (!isObject(input)) throw badRequest('El cuerpo de la venta debe ser un objeto.');
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throw badRequest('La venta requiere al menos un concepto.');
  const result = {
    contactId: uuid(input.contactId, 'contactId', { required: true }),
    executiveId: uuid(input.executiveId, 'executiveId', { required: true }),
    seasonCode: canonicalSeason(input.seasonCode, { required: true }),
    status: enumValue(input.status ?? 'draft', SALE_STATUSES, 'status', { required: true }),
    soldAt: isoDate(input.soldAt, 'soldAt'),
    currency: enumValue(input.currency ?? 'MXN', ['MXN'], 'currency', { required: true }),
    notes: cleanString(input.notes, { max: 4000, field: 'notes' }),
    items: items.map((item, index) => ({
      product: cleanString(item.product, { required: true, max: 160, field: `items[${index}].product` }),
      zone: cleanString(item.zone, { max: 120, field: `items[${index}].zone` }),
      quantity: integer(item.quantity, `items[${index}].quantity`, { min: 1, max: 1000, required: true }),
      unitPrice: decimal(item.unitPrice, `items[${index}].unitPrice`, { min: 0, required: true })
    })),
    payments: (Array.isArray(input.payments) ? input.payments : []).map((payment, index) => ({
      amount: decimal(payment.amount, `payments[${index}].amount`, { min: 0.01, required: true }),
      method: cleanString(payment.method, { required: true, max: 80, field: `payments[${index}].method` }),
      paidAt: isoDate(payment.paidAt, `payments[${index}].paidAt`) ?? new Date().toISOString(),
      reference: cleanString(payment.reference, { max: 160, field: `payments[${index}].reference` })
    }))
  };
  if (result.status === 'confirmed' && !result.soldAt) {
    throw badRequest('soldAt es obligatoria para confirmar una venta.');
  }
  return result;
}

export function validatePayment(input) {
  if (!isObject(input)) throw badRequest('El cuerpo del pago debe ser un objeto.');
  return {
    amount: decimal(input.amount, 'amount', { min: 0.01, required: true }),
    method: cleanString(input.method, { required: true, max: 80, field: 'method' }),
    paidAt: isoDate(input.paidAt, 'paidAt') ?? new Date().toISOString(),
    reference: cleanString(input.reference, { max: 160, field: 'reference' })
  };
}

export function validateDashboardPdfEvent(input) {
  if (!isObject(input) || !isObject(input.filters)) {
    throw badRequest('El evento de PDF debe incluir filters.');
  }
  const allowedRoot = new Set(['filters']);
  const allowedFilters = new Set(['season', 'executiveId', 'from', 'to']);
  if (Object.keys(input).some((key) => !allowedRoot.has(key))
    || Object.keys(input.filters).some((key) => !allowedFilters.has(key))) {
    throw badRequest('El evento de PDF contiene campos no permitidos.');
  }
  return {
    filters: pickDefined({
      season: canonicalSeason(input.filters.season, { field: 'season' }),
      executiveId: input.filters.executiveId ? uuid(input.filters.executiveId, 'executiveId') : undefined,
      from: input.filters.from ? isoDate(input.filters.from, 'from') : undefined,
      to: input.filters.to ? isoDate(input.filters.to, 'to') : undefined
    })
  };
}

export function parseListQuery(query = {}) {
  const page = integer(query.page ?? 1, 'page', { min: 1, max: 100000, required: true });
  const pageSize = integer(query.pageSize ?? 25, 'pageSize', { min: 1, max: 100, required: true });
  return {
    page,
    pageSize,
    season: canonicalSeason(query.season, { field: 'season' }),
    search: cleanString(query.search, { max: 160, field: 'search' }),
    segment: query.segment ? enumValue(query.segment, CONTACT_SEGMENTS, 'segment') : undefined,
    assignment: query.assignment ? enumValue(query.assignment, CONTACT_ASSIGNMENTS, 'assignment') : undefined,
    dateField: query.dateField
      ? enumValue(query.dateField, CONTACT_DATE_FIELDS, 'dateField')
      : 'updatedAt',
    taskState: query.taskState ? enumValue(query.taskState, TASK_STATES, 'taskState') : undefined,
    subscriberStatus: query.subscriberStatus ? enumValue(query.subscriberStatus, CONTACT_STATUSES, 'subscriberStatus') : undefined,
    commercialStage: query.commercialStage ? enumValue(query.commercialStage, COMMERCIAL_STAGES, 'commercialStage') : undefined,
    lastChannel: query.lastChannel ? enumValue(query.lastChannel, CHANNELS, 'lastChannel') : undefined,
    executiveId: query.executiveId ? uuid(query.executiveId, 'executiveId') : undefined,
    from: query.from ? isoDate(query.from, 'from') : undefined,
    to: query.to ? isoDate(query.to, 'to') : undefined,
    sort: cleanString(query.sort, { max: 50, field: 'sort' }) ?? 'updatedAt',
    order: query.order === 'asc' ? 'asc' : 'desc',
    includeDeleted: query.includeDeleted === 'true',
    deletedOnly: query.deletedOnly === 'true'
  };
}
