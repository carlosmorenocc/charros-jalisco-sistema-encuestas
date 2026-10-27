import crypto from 'node:crypto';
import { SEGMENTS } from './segments.js';

export const MAX_ROSTER_PROGRAMS = 1000;

const SEGMENT_SET = new Set(SEGMENTS);
const PAYLOAD_FIELDS = new Set(['seasonCode','sourceFilename','expectedTotals','records']);
const EXPECTED_TOTAL_FIELDS = new Set(['programs','orders','holders','bySegment']);
const RECORD_FIELDS = new Set([
  'seasonCode',
  'orderNumber',
  'purchaseCode',
  'holderName',
  'holderEmail',
  'holderPhone',
  'zone',
  'section',
  'seat',
  'barcode',
  'sourceEvent',
  'segment',
  'seller',
  'discountLabel',
  'purchasedAt',
  'paymentType',
  'sourceReference'
]);
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const ISO_TIMESTAMP_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/iu;

export class RosterValidationError extends Error {
  constructor(message, { code = 'INVALID_ROSTER_PAYLOAD', field, recordIndex } = {}) {
    super(message);
    this.name = 'RosterValidationError';
    this.status = 400;
    this.code = code;
    if (field) this.field = field;
    if (Number.isInteger(recordIndex)) this.recordIndex = recordIndex;
  }
}

function reject(message, details) {
  throw new RosterValidationError(message, details);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertAllowedFields(value, allowed, message, field, recordIndex) {
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    reject(message, { field, recordIndex });
  }
}

function normalizedText(value, {
  field,
  recordIndex,
  required = false,
  allowNumber = false,
  maxLength = 300
}) {
  let text;
  if (typeof value === 'string') {
    text = value;
  } else if (allowNumber && typeof value === 'number' && Number.isSafeInteger(value)) {
    text = String(value);
  } else if (value === undefined || value === null) {
    text = '';
  } else {
    reject(`El campo ${field} debe ser texto`, { field, recordIndex });
  }

  text = text.normalize('NFC').replace(/\s+/gu,' ').trim();
  if (!text) {
    if (required) reject(`El campo ${field} es obligatorio`, { field, recordIndex });
    return null;
  }
  if (text.length > maxLength || CONTROL_CHARACTER.test(text)) {
    reject(`El campo ${field} no tiene un formato válido`, { field, recordIndex });
  }
  return text;
}

function normalizeSeasonCode(value, field = 'seasonCode', recordIndex) {
  const seasonCode = normalizedText(value, {
    field,
    recordIndex,
    required: true,
    maxLength: 32
  }).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/u.test(seasonCode)) {
    reject(`El campo ${field} no tiene un formato válido`, { field, recordIndex });
  }
  return seasonCode;
}

function normalizeFilename(value) {
  const filename = normalizedText(value, {
    field: 'sourceFilename',
    required: true,
    maxLength: 255
  });
  if (/[\\/:*?"<>|]/u.test(filename) || filename === '.' || filename === '..') {
    reject('El campo sourceFilename no tiene un formato válido', { field: 'sourceFilename' });
  }
  return filename;
}

function normalizeEmail(value, recordIndex) {
  const email = normalizedText(value, {
    field: 'holderEmail',
    recordIndex,
    maxLength: 254
  });
  if (email === null) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    reject('El campo holderEmail no tiene un formato válido', {
      field: 'holderEmail',
      recordIndex
    });
  }
  return email.toLowerCase();
}

function normalizePurchasedAt(value, recordIndex) {
  const purchasedAt = normalizedText(value, {
    field: 'purchasedAt',
    recordIndex,
    maxLength: 50
  });
  if (purchasedAt === null) return null;

  const dateMatch = purchasedAt.match(ISO_DATE);
  if (dateMatch) {
    const [,yearText,monthText,dayText] = dateMatch;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const candidate = new Date(Date.UTC(year,month - 1,day));
    if (
      candidate.getUTCFullYear() === year
      && candidate.getUTCMonth() === month - 1
      && candidate.getUTCDate() === day
    ) return purchasedAt;
  } else if (ISO_TIMESTAMP_WITH_ZONE.test(purchasedAt)) {
    const candidate = new Date(purchasedAt);
    if (!Number.isNaN(candidate.getTime())) return candidate.toISOString();
  }

  reject('El campo purchasedAt no tiene un formato válido', {
    field: 'purchasedAt',
    recordIndex
  });
}

function normalizeSegment(value, recordIndex) {
  const segment = normalizedText(value, {
    field: 'segment',
    recordIndex,
    required: true,
    maxLength: 20
  }).toUpperCase();
  if (!SEGMENT_SET.has(segment)) {
    reject('El segmento debe ser VIP, PREFERENTE o GENERAL', {
      code: 'INVALID_ROSTER_SEGMENT',
      field: 'segment',
      recordIndex
    });
  }
  return segment;
}

function normalizeRecord(record, seasonCode, recordIndex) {
  if (!isPlainObject(record)) {
    reject(`El registro ${recordIndex + 1} debe ser un objeto`, {
      field: 'records',
      recordIndex
    });
  }
  assertAllowedFields(
    record,
    RECORD_FIELDS,
    `El registro ${recordIndex + 1} contiene campos no admitidos`,
    'records',
    recordIndex
  );

  if (record.seasonCode !== undefined) {
    const recordSeason = normalizeSeasonCode(record.seasonCode,'seasonCode',recordIndex);
    if (recordSeason !== seasonCode) {
      reject(`La temporada del registro ${recordIndex + 1} no coincide con el payload`, {
        code: 'ROSTER_SEASON_MISMATCH',
        field: 'seasonCode',
        recordIndex
      });
    }
  }

  return {
    seasonCode,
    orderNumber: normalizedText(record.orderNumber, {
      field: 'orderNumber', recordIndex, required: true, allowNumber: true, maxLength: 100
    }),
    purchaseCode: normalizedText(record.purchaseCode, {
      field: 'purchaseCode', recordIndex, allowNumber: true, maxLength: 100
    }),
    holderName: normalizedText(record.holderName, {
      field: 'holderName', recordIndex, required: true, maxLength: 200
    }),
    holderEmail: normalizeEmail(record.holderEmail,recordIndex),
    holderPhone: normalizedText(record.holderPhone, {
      field: 'holderPhone', recordIndex, maxLength: 80
    }),
    zone: normalizedText(record.zone, {
      field: 'zone', recordIndex, required: true, maxLength: 150
    }),
    section: normalizedText(record.section, {
      field: 'section', recordIndex, required: true, allowNumber: true, maxLength: 100
    }),
    seat: normalizedText(record.seat, {
      field: 'seat', recordIndex, required: true, allowNumber: true, maxLength: 100
    }),
    barcode: normalizedText(record.barcode, {
      field: 'barcode', recordIndex, allowNumber: true, maxLength: 200
    }),
    sourceEvent: normalizedText(record.sourceEvent, {
      field: 'sourceEvent', recordIndex, required: true, maxLength: 300
    }),
    segment: normalizeSegment(record.segment,recordIndex),
    seller: normalizedText(record.seller, {
      field: 'seller', recordIndex, maxLength: 200
    }),
    discountLabel: normalizedText(record.discountLabel, {
      field: 'discountLabel', recordIndex, maxLength: 200
    }),
    purchasedAt: normalizePurchasedAt(record.purchasedAt,recordIndex),
    paymentType: normalizedText(record.paymentType, {
      field: 'paymentType', recordIndex, maxLength: 100
    }),
    sourceReference: normalizedText(record.sourceReference, {
      field: 'sourceReference', recordIndex, allowNumber: true, maxLength: 200
    })
  };
}

function canonicalIdentity(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu,'')
    .toUpperCase();
}

function holderIdentityKey(record) {
  const identityPart = (value) => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu,'')
    .trim()
    .replace(/\s+/gu,' ')
    .toLocaleLowerCase('es-MX');
  return crypto.createHash('sha256').update([
    identityPart(record.holderName),
    identityPart(record.holderEmail),
    identityPart(record.holderPhone).replace(/\D/gu,'')
  ].join('|')).digest('hex');
}

function identityKey(parts) {
  return JSON.stringify(parts.map(canonicalIdentity));
}

function canonicalSeatIdentity(value) {
  return canonicalIdentity(value).replace(/[^A-Z0-9]/gu,'');
}

function programKey(record) {
  return JSON.stringify([
    record.seasonCode,
    record.orderNumber,
    record.zone,
    record.section,
    canonicalSeatIdentity(record.seat)
  ].map(canonicalIdentity));
}

function physicalSeatKey(record) {
  return JSON.stringify([
    record.seasonCode,
    record.zone,
    record.section,
    canonicalSeatIdentity(record.seat)
  ].map(canonicalIdentity));
}

function assertNoDuplicateSeats(records) {
  const programs = new Map();
  const physicalSeats = new Map();

  records.forEach((record,index) => {
    const canonicalProgram = programKey(record);
    const duplicateProgram = programs.get(canonicalProgram);
    if (duplicateProgram !== undefined) {
      reject(`Los registros ${duplicateProgram + 1} y ${index + 1} describen el mismo programa`, {
        code: 'DUPLICATE_ROSTER_PROGRAM',
        field: 'records',
        recordIndex: index
      });
    }

    const canonicalSeat = physicalSeatKey(record);
    const duplicateSeat = physicalSeats.get(canonicalSeat);
    if (duplicateSeat !== undefined) {
      reject(`Los registros ${duplicateSeat + 1} y ${index + 1} describen la misma butaca física`, {
        code: 'DUPLICATE_PHYSICAL_SEAT',
        field: 'records',
        recordIndex: index
      });
    }

    programs.set(canonicalProgram,index);
    physicalSeats.set(canonicalSeat,index);
  });
}

function expectedInteger(value, field, { minimum = 0, maximum = MAX_ROSTER_PROGRAMS } = {}) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    reject(`El campo ${field} debe ser un entero entre ${minimum} y ${maximum}`, { field });
  }
  return value;
}

function normalizeExpectedTotals(value) {
  if (!isPlainObject(value)) {
    reject('El campo expectedTotals debe ser un objeto', { field: 'expectedTotals' });
  }
  assertAllowedFields(
    value,
    EXPECTED_TOTAL_FIELDS,
    'El campo expectedTotals contiene campos no admitidos',
    'expectedTotals'
  );
  if (!isPlainObject(value.bySegment)) {
    reject('El campo expectedTotals.bySegment debe ser un objeto', {
      field: 'expectedTotals.bySegment'
    });
  }
  assertAllowedFields(
    value.bySegment,
    SEGMENT_SET,
    'El campo expectedTotals.bySegment contiene segmentos no admitidos',
    'expectedTotals.bySegment'
  );
  for (const segment of SEGMENTS) {
    if (!Object.hasOwn(value.bySegment,segment)) {
      reject(`Falta el total esperado del segmento ${segment}`, {
        field: `expectedTotals.bySegment.${segment}`
      });
    }
  }

  const expectedTotals = {
    programs: expectedInteger(value.programs,'expectedTotals.programs', { minimum: 1 }),
    bySegment: Object.fromEntries(SEGMENTS.map((segment) => [
      segment,
      expectedInteger(value.bySegment[segment],`expectedTotals.bySegment.${segment}`)
    ]))
  };
  if (value.orders !== undefined) {
    expectedTotals.orders = expectedInteger(value.orders,'expectedTotals.orders', { minimum: 1 });
  }
  if (value.holders !== undefined) {
    expectedTotals.holders = expectedInteger(value.holders,'expectedTotals.holders', { minimum: 1 });
  }
  if (Object.values(expectedTotals.bySegment).reduce((sum,total) => sum + total,0) !== expectedTotals.programs) {
    reject('Los totales esperados por segmento no suman el total de programas', {
      code: 'INVALID_EXPECTED_TOTALS',
      field: 'expectedTotals.bySegment'
    });
  }
  return expectedTotals;
}

function calculateTotals(records) {
  const orders = new Set();
  const holders = new Set();
  const bySegment = Object.fromEntries(SEGMENTS.map((segment) => [segment,0]));
  for (const record of records) {
    orders.add(JSON.stringify([record.seasonCode,record.orderNumber]));
    holders.add(holderIdentityKey(record));
    bySegment[record.segment] += 1;
  }
  return {
    programs: records.length,
    orders: orders.size,
    holders: holders.size,
    bySegment
  };
}

function assertExpectedTotals(totals, expectedTotals) {
  if (totals.programs !== expectedTotals.programs) {
    reject('El total esperado de programas no coincide con los registros', {
      code: 'ROSTER_TOTAL_MISMATCH',
      field: 'expectedTotals.programs'
    });
  }
  for (const segment of SEGMENTS) {
    if (totals.bySegment[segment] !== expectedTotals.bySegment[segment]) {
      reject(`El total esperado del segmento ${segment} no coincide con los registros`, {
        code: 'ROSTER_TOTAL_MISMATCH',
        field: `expectedTotals.bySegment.${segment}`
      });
    }
  }
  for (const field of ['orders','holders']) {
    if (expectedTotals[field] !== undefined && totals[field] !== expectedTotals[field]) {
      reject(`El total esperado de ${field} no coincide con los registros`, {
        code: 'ROSTER_TOTAL_MISMATCH',
        field: `expectedTotals.${field}`
      });
    }
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort(compareText)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sortRecords(records) {
  return [...records].sort((left,right) => {
    const byProgram = compareText(programKey(left),programKey(right));
    if (byProgram !== 0) return byProgram;
    return compareText(stableStringify(left),stableStringify(right));
  });
}

/**
 * Validates and canonicalizes an initial rewards roster without performing I/O.
 * Errors deliberately identify only fields and row numbers, never field values.
 */
export function validateRosterPayload(payload) {
  if (!isPlainObject(payload)) {
    reject('El payload del padrón debe ser un objeto', { field: 'payload' });
  }
  assertAllowedFields(payload,PAYLOAD_FIELDS,'El payload contiene campos no admitidos','payload');

  const seasonCode = normalizeSeasonCode(payload.seasonCode);
  const sourceFilename = normalizeFilename(payload.sourceFilename);

  if (!Array.isArray(payload.records)) {
    reject('El campo records debe ser un arreglo', { field: 'records' });
  }
  if (payload.records.length < 1 || payload.records.length > MAX_ROSTER_PROGRAMS) {
    reject(`El padrón debe contener entre 1 y ${MAX_ROSTER_PROGRAMS} programas`, {
      code: 'INVALID_ROSTER_SIZE',
      field: 'records'
    });
  }
  const expectedTotals = normalizeExpectedTotals(payload.expectedTotals);

  const records = payload.records.map((record,index) => normalizeRecord(record,seasonCode,index));
  assertNoDuplicateSeats(records);
  const totals = calculateTotals(records);
  assertExpectedTotals(totals,expectedTotals);
  const sortedRecords = sortRecords(records);
  const canonical = stableStringify({ seasonCode,records: sortedRecords });
  const sha256 = crypto.createHash('sha256').update(canonical,'utf8').digest('hex');

  return { seasonCode,sourceFilename,records: sortedRecords,totals,expectedTotals,sha256 };
}
