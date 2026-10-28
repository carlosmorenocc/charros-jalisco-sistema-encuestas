import crypto from 'node:crypto';

const TOP_LEVEL_FIELDS = new Set([
  'version',
  'seasonCode',
  'reasonCode',
  'holder',
  'order',
  'program',
  'historicalAttendance'
]);
const HOLDER_FIELDS = new Set(['displayName','email','phone']);
const ORDER_FIELDS = new Set([
  'orderNumber',
  'purchaseCode',
  'sourceEvent',
  'seller',
  'discountLabel',
  'purchasedAt',
  'paymentType'
]);
const PROGRAM_FIELDS = new Set([
  'segment',
  'zone',
  'section',
  'seat',
  'barcode',
  'sourceReference'
]);
const ATTENDANCE_FIELDS = new Set([
  'gamePlayedOn',
  'importSha256',
  'scannedAt',
  'barcode'
]);
const SEGMENTS = new Set(['VIP','PREFERENTE','GENERAL']);
const REASON_CODES = new Set(['authorized_giveaway_courtesy']);
const SHA256 = /^[a-f0-9]{64}$/u;
const SEASON_CODE = /^[A-Z0-9][A-Z0-9._-]{0,31}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const ISO_TIMESTAMP_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/iu;
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/u;

const ENROLLMENT_ERROR_CODES = new Set([
  'CONFIG_JSON_INVALID',
  'CONFIG_PAYLOAD_INVALID',
  'CONFIG_UNSUPPORTED_FIELD',
  'CONFIG_VERSION_INVALID',
  'CONFIG_FIELD_TYPE_INVALID',
  'CONFIG_FIELD_FORMAT_INVALID',
  'CONFIG_EMAIL_INVALID',
  'CONFIG_SEGMENT_INVALID',
  'CONFIG_REASON_INVALID',
  'CONFIG_ATTENDANCE_INVALID',
  'CONFIG_ATTENDANCE_DUPLICATE',
  'DB_LOCK_FAILED',
  'DB_SEASON_READ_FAILED',
  'DB_HOLDER_READ_FAILED',
  'DB_ORDER_READ_FAILED',
  'DB_PROGRAM_READ_FAILED',
  'DB_PHYSICAL_SEAT_READ_FAILED',
  'DB_ALIAS_READ_FAILED',
  'DB_HISTORY_IMPORT_READ_FAILED',
  'DB_ATTENDANCE_READ_FAILED',
  'DB_HOLDER_INSERT_FAILED',
  'DB_ORDER_INSERT_FAILED',
  'DB_PROGRAM_INSERT_FAILED',
  'DB_ATTENDANCE_INSERT_FAILED',
  'DB_AUDIT_WRITE_FAILED',
  'SEASON_STATE_INVALID',
  'HOLDER_STATE_AMBIGUOUS',
  'HOLDER_STATE_MISMATCH',
  'ORDER_STATE_AMBIGUOUS',
  'ORDER_STATE_MISMATCH',
  'PROGRAM_STATE_AMBIGUOUS',
  'PROGRAM_STATE_MISMATCH',
  'PHYSICAL_SEAT_CONFLICT',
  'ALIAS_KEY_CONFLICT',
  'HISTORY_IMPORT_MISMATCH',
  'HISTORY_ATTENDANCE_CONFLICT',
  'HOLDER_INSERT_FAILED',
  'ORDER_INSERT_FAILED',
  'PROGRAM_INSERT_FAILED',
  'ATTENDANCE_INSERT_FAILED',
  'AUDIT_WRITE_FAILED'
]);

export class ProgramEnrollmentError extends Error {
  constructor(code) {
    super('Exceptional program enrollment validation failed.');
    this.name = 'ProgramEnrollmentError';
    this.code = ENROLLMENT_ERROR_CODES.has(code) ? code : 'ENROLLMENT_VALIDATION_FAILED';
  }
}

function fail(code) {
  throw new ProgramEnrollmentError(code);
}

async function guardedQuery(client,failureCode,sql,params = []) {
  try {
    return await client.query(sql,params);
  } catch (error) {
    if (error instanceof ProgramEnrollmentError) throw error;
    fail(failureCode);
  }
}

export function safeEnrollmentFailureLog(error) {
  if (error instanceof ProgramEnrollmentError && ENROLLMENT_ERROR_CODES.has(error.code)) {
    return `Exceptional program enrollment failed [${error.code}]; no enrollment was committed.`;
  }
  return 'Exceptional program enrollment failed [UNEXPECTED_ERROR]; no enrollment was committed.';
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertAllowedFields(value,allowed) {
  if (Object.keys(value).some((field) => !allowed.has(field))) fail('CONFIG_UNSUPPORTED_FIELD');
}

function textField(value,{ required = false, allowNumber = false, maxLength = 300 } = {}) {
  let normalized;
  if (typeof value === 'string') normalized = value;
  else if (allowNumber && typeof value === 'number' && Number.isSafeInteger(value)) {
    normalized = String(value);
  } else if (value === undefined || value === null) normalized = '';
  else fail('CONFIG_FIELD_TYPE_INVALID');

  normalized = normalized.normalize('NFC').replace(/\s+/gu,' ').trim();
  if (!normalized) {
    if (required) fail('CONFIG_FIELD_FORMAT_INVALID');
    return null;
  }
  if (normalized.length > maxLength || CONTROL_CHARACTER.test(normalized)) {
    fail('CONFIG_FIELD_FORMAT_INVALID');
  }
  return normalized;
}

function identityPart(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu,'')
    .trim()
    .replace(/\s+/gu,' ')
    .toLocaleLowerCase('es-MX');
}

export function enrollmentHolderIdentityKey({ displayName,email,phone }) {
  return crypto.createHash('sha256').update([
    identityPart(displayName),
    identityPart(email),
    identityPart(phone).replace(/\D/gu,'')
  ].join('|')).digest('hex');
}

function canonical(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu,'')
    .toUpperCase()
    .replace(/\s+/gu,' ')
    .trim();
}

function canonicalToken(value) {
  return canonical(value).replace(/[^A-Z0-9]/gu,'');
}

function normalizeEmail(value) {
  const email = textField(value,{ maxLength:254 });
  if (email === null) return null;
  if (!EMAIL.test(email)) fail('CONFIG_EMAIL_INVALID');
  return email.toLowerCase();
}

function normalizeDate(value) {
  const date = textField(value,{ required:true,maxLength:10 });
  const match = date.match(ISO_DATE);
  if (!match) fail('CONFIG_ATTENDANCE_INVALID');
  const [,yearText,monthText,dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year,month - 1,day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) fail('CONFIG_ATTENDANCE_INVALID');
  return date;
}

function normalizeTimestamp(value,{ attendance = false } = {}) {
  const timestamp = textField(value,{ required:true,maxLength:50 });
  if (!ISO_TIMESTAMP_WITH_ZONE.test(timestamp)) {
    fail(attendance ? 'CONFIG_ATTENDANCE_INVALID' : 'CONFIG_FIELD_FORMAT_INVALID');
  }
  const candidate = new Date(timestamp);
  if (Number.isNaN(candidate.getTime())) {
    fail(attendance ? 'CONFIG_ATTENDANCE_INVALID' : 'CONFIG_FIELD_FORMAT_INVALID');
  }
  return candidate.toISOString();
}

function normalizeNullableTimestamp(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return normalizeTimestamp(value);
}

function normalizeHolder(value) {
  if (!isPlainObject(value)) fail('CONFIG_PAYLOAD_INVALID');
  assertAllowedFields(value,HOLDER_FIELDS);
  return {
    displayName:textField(value.displayName,{ required:true,maxLength:200 }),
    email:normalizeEmail(value.email),
    phone:textField(value.phone,{ maxLength:80 })
  };
}

function normalizeOrder(value) {
  if (!isPlainObject(value)) fail('CONFIG_PAYLOAD_INVALID');
  assertAllowedFields(value,ORDER_FIELDS);
  return {
    orderNumber:textField(value.orderNumber,{ required:true,allowNumber:true,maxLength:100 }),
    purchaseCode:textField(value.purchaseCode,{ allowNumber:true,maxLength:100 }),
    sourceEvent:textField(value.sourceEvent,{ required:true,maxLength:300 }),
    seller:textField(value.seller,{ maxLength:200 }),
    discountLabel:textField(value.discountLabel,{ maxLength:200 }),
    purchasedAt:normalizeNullableTimestamp(value.purchasedAt),
    paymentType:textField(value.paymentType,{ maxLength:100 })
  };
}

function normalizeProgram(value) {
  if (!isPlainObject(value)) fail('CONFIG_PAYLOAD_INVALID');
  assertAllowedFields(value,PROGRAM_FIELDS);
  const segment = textField(value.segment,{ required:true,maxLength:20 }).toUpperCase();
  if (!SEGMENTS.has(segment)) fail('CONFIG_SEGMENT_INVALID');
  return {
    segment,
    zone:textField(value.zone,{ required:true,maxLength:150 }),
    section:textField(value.section,{ required:true,allowNumber:true,maxLength:100 }),
    seat:textField(value.seat,{ required:true,allowNumber:true,maxLength:100 }),
    barcode:textField(value.barcode,{ allowNumber:true,maxLength:200 }),
    sourceReference:textField(value.sourceReference,{
      required:true,allowNumber:true,maxLength:200
    })
  };
}

function normalizeAttendance(value) {
  if (!isPlainObject(value)) fail('CONFIG_ATTENDANCE_INVALID');
  assertAllowedFields(value,ATTENDANCE_FIELDS);
  const gamePlayedOn = normalizeDate(value.gamePlayedOn);
  const importSha256 = textField(value.importSha256,{ required:true,maxLength:64 }).toLowerCase();
  if (!SHA256.test(importSha256)) fail('CONFIG_ATTENDANCE_INVALID');
  const scannedAt = normalizeTimestamp(value.scannedAt,{ attendance:true });
  if (String(value.scannedAt).slice(0,10) !== gamePlayedOn) fail('CONFIG_ATTENDANCE_INVALID');
  return {
    gamePlayedOn,
    importSha256,
    scannedAt,
    barcode:textField(value.barcode,{ allowNumber:true,maxLength:200 })
  };
}

export function parseProgramEnrollment(rawValue) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') return null;
  let value;
  try {
    value = JSON.parse(String(rawValue));
  } catch {
    fail('CONFIG_JSON_INVALID');
  }
  if (!isPlainObject(value)) fail('CONFIG_PAYLOAD_INVALID');
  assertAllowedFields(value,TOP_LEVEL_FIELDS);
  if (value.version !== 1) fail('CONFIG_VERSION_INVALID');

  const seasonCode = textField(value.seasonCode,{ required:true,maxLength:32 }).toUpperCase();
  if (!SEASON_CODE.test(seasonCode)) fail('CONFIG_FIELD_FORMAT_INVALID');
  const reasonCode = textField(value.reasonCode,{ required:true,maxLength:80 }).toLowerCase();
  if (!REASON_CODES.has(reasonCode)) fail('CONFIG_REASON_INVALID');
  if (!Array.isArray(value.historicalAttendance) || value.historicalAttendance.length > 34) {
    fail('CONFIG_ATTENDANCE_INVALID');
  }
  const historicalAttendance = value.historicalAttendance.map(normalizeAttendance);
  const dates = new Set(historicalAttendance.map((attendance) => attendance.gamePlayedOn));
  if (dates.size !== historicalAttendance.length) fail('CONFIG_ATTENDANCE_DUPLICATE');

  return {
    version:1,
    seasonCode,
    reasonCode,
    holder:normalizeHolder(value.holder),
    order:normalizeOrder(value.order),
    program:normalizeProgram(value.program),
    historicalAttendance:historicalAttendance.sort((left,right) => (
      left.gamePlayedOn.localeCompare(right.gamePlayedOn)
    ))
  };
}

function sameNullable(left,right) {
  return String(left ?? '') === String(right ?? '');
}

function sameTimestamp(left,right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function verifyHolder(holder,config,identityKey) {
  if (
    holder.identity_key !== identityKey
    || holder.display_name !== config.holder.displayName
    || !sameNullable(holder.email,config.holder.email)
    || !sameNullable(holder.phone,config.holder.phone)
    || holder.active !== true
  ) fail('HOLDER_STATE_MISMATCH');
}

function verifyOrder(order,config,holderId) {
  if (
    order.season_code !== config.seasonCode
    || order.order_number !== config.order.orderNumber
    || order.buyer_holder_id !== holderId
    || !sameNullable(order.purchase_code,config.order.purchaseCode)
    || !sameNullable(order.seller,config.order.seller)
    || !sameNullable(order.discount_label,config.order.discountLabel)
    || !sameTimestamp(order.purchased_at,config.order.purchasedAt)
    || !sameNullable(order.payment_type,config.order.paymentType)
    || order.source_event !== config.order.sourceEvent
    || order.active !== true
  ) fail('ORDER_STATE_MISMATCH');
}

function verifyProgram(program,config,holderId,orderId) {
  if (
    program.season_code !== config.seasonCode
    || program.order_number !== config.order.orderNumber
    || program.holder_id !== holderId
    || program.order_id !== orderId
    || program.holder_name !== config.holder.displayName
    || !sameNullable(program.holder_email,config.holder.email)
    || !sameNullable(program.holder_phone,config.holder.phone)
    || !sameNullable(program.purchase_code,config.order.purchaseCode)
    || program.zone !== config.program.zone
    || program.section !== config.program.section
    || program.seat !== config.program.seat
    || !sameNullable(program.barcode,config.program.barcode)
    || program.source_event !== config.order.sourceEvent
    || program.segment !== config.program.segment
    || program.eligibility_status !== 'eligible'
    || program.eligibility_exception !== config.reasonCode
    || program.active !== true
    || program.manual_lock !== true
    || !sameNullable(program.source_reference,config.program.sourceReference)
  ) fail('PROGRAM_STATE_MISMATCH');
}

async function resolveHistoricalImports(client,config) {
  const resolved = [];
  for (const attendance of config.historicalAttendance) {
    const result = await guardedQuery(client,'DB_HISTORY_IMPORT_READ_FAILED',`
      /* program-enrollment:history-import */
      SELECT i.id import_id,i.game_id,g.played_on::text played_on
      FROM rewards_imports i
      JOIN rewards_games g ON g.id=i.game_id
      WHERE i.kind='access' AND i.sha256=$1 AND g.played_on=$2::date
      FOR UPDATE OF i,g
    `,[attendance.importSha256,attendance.gamePlayedOn]);
    if (result.rowCount !== 1) fail('HISTORY_IMPORT_MISMATCH');
    resolved.push({ ...attendance,...result.rows[0] });
  }
  return resolved;
}

function verifyExistingAttendance(rows,resolved) {
  if (rows.length !== resolved.length) fail('HISTORY_ATTENDANCE_CONFLICT');
  const byGame = new Map(rows.map((row) => [row.game_id,row]));
  for (const expected of resolved) {
    const current = byGame.get(expected.game_id);
    if (
      !current
      || current.first_import_id !== expected.import_id
      || !sameTimestamp(current.scanned_at,expected.scannedAt)
      || !sameNullable(current.barcode,expected.barcode)
    ) fail('HISTORY_ATTENDANCE_CONFLICT');
  }
}

export async function applyProgramEnrollment(client,config) {
  if (!config) return { status:'disabled',attendanceCount:0 };
  await guardedQuery(
    client,
    'DB_LOCK_FAILED',
    "/* program-enrollment:lock */ SELECT pg_advisory_xact_lock(hashtext('rewards-program-enrollment:' || $1))",
    [config.seasonCode]
  );

  const seasonResult = await guardedQuery(client,'DB_SEASON_READ_FAILED',`
    /* program-enrollment:season */
    SELECT code,active
    FROM rewards_seasons
    WHERE code=$1
    FOR UPDATE
  `,[config.seasonCode]);
  if (seasonResult.rowCount !== 1 || seasonResult.rows[0].active !== true) {
    fail('SEASON_STATE_INVALID');
  }

  const identityKey = enrollmentHolderIdentityKey(config.holder);
  const holderResult = await guardedQuery(client,'DB_HOLDER_READ_FAILED',`
    /* program-enrollment:holder */
    SELECT id,identity_key,display_name,email,phone,active
    FROM rewards_holders
    WHERE identity_key=$1
    FOR UPDATE
  `,[identityKey]);
  if (holderResult.rowCount > 1) fail('HOLDER_STATE_AMBIGUOUS');

  const normalizedOrder = canonicalToken(config.order.orderNumber);
  const orderResult = await guardedQuery(client,'DB_ORDER_READ_FAILED',`
    /* program-enrollment:order */
    SELECT id,season_code,order_number,purchase_code,buyer_holder_id,seller,
           discount_label,purchased_at,payment_type,source_event,active
    FROM rewards_orders
    WHERE season_code=$1
      AND regexp_replace(upper(order_number),'[^A-Z0-9]','','g')=$2
    ORDER BY id
    FOR UPDATE
  `,[config.seasonCode,normalizedOrder]);
  if (orderResult.rowCount > 1) fail('ORDER_STATE_AMBIGUOUS');

  const programResult = await guardedQuery(client,'DB_PROGRAM_READ_FAILED',`
    /* program-enrollment:program */
    SELECT id,season_code,order_number,purchase_code,holder_name,holder_email,
           holder_phone,zone,section,seat,barcode,source_event,segment,
           eligibility_status,eligibility_exception,manual_lock,active,
           holder_id,order_id,source_reference
    FROM rewards_programs
    WHERE season_code=$1
      AND regexp_replace(upper(order_number),'[^A-Z0-9]','','g')=$2
    ORDER BY id
    FOR UPDATE
  `,[config.seasonCode,normalizedOrder]);
  if (programResult.rowCount > 1) fail('PROGRAM_STATE_AMBIGUOUS');

  const physicalResult = await guardedQuery(client,'DB_PHYSICAL_SEAT_READ_FAILED',`
    /* program-enrollment:physical-seat */
    SELECT id
    FROM rewards_programs
    WHERE season_code=$1
      AND active
      AND eligibility_status='eligible'
      AND regexp_replace(upper(zone),'[^A-Z0-9]','','g')=$2
      AND regexp_replace(upper(section),'[^A-Z0-9]','','g')=$3
      AND regexp_replace(upper(seat),'[^A-Z0-9]','','g')=$4
    ORDER BY id
    FOR UPDATE
  `,[
    config.seasonCode,
    canonicalToken(config.program.zone),
    canonicalToken(config.program.section),
    canonicalToken(config.program.seat)
  ]);

  const aliasResult = await guardedQuery(client,'DB_ALIAS_READ_FAILED',`
    /* program-enrollment:alias */
    SELECT id,program_id
    FROM rewards_program_aliases
    WHERE season_code=$1
      AND active
      AND regexp_replace(upper(historical_order_number),'[^A-Z0-9]','','g')=$2
      AND regexp_replace(upper(historical_zone),'[^A-Z0-9]','','g')=$3
      AND regexp_replace(upper(historical_section),'[^A-Z0-9]','','g')=$4
      AND regexp_replace(upper(historical_seat),'[^A-Z0-9]','','g')=$5
    ORDER BY id
    FOR UPDATE
  `,[
    config.seasonCode,
    normalizedOrder,
    canonicalToken(config.program.zone),
    canonicalToken(config.program.section),
    canonicalToken(config.program.seat)
  ]);
  if (aliasResult.rowCount !== 0) fail('ALIAS_KEY_CONFLICT');

  const historicalImports = await resolveHistoricalImports(client,config);
  const alreadyApplied = orderResult.rowCount === 1 || programResult.rowCount === 1;
  if (alreadyApplied && (orderResult.rowCount !== 1 || programResult.rowCount !== 1)) {
    fail('PROGRAM_STATE_MISMATCH');
  }
  if (!alreadyApplied && physicalResult.rowCount !== 0) fail('PHYSICAL_SEAT_CONFLICT');

  let holder = holderResult.rows[0];
  let holderCreated = false;
  if (holder) verifyHolder(holder,config,identityKey);
  else {
    const insertedHolder = await guardedQuery(client,'DB_HOLDER_INSERT_FAILED',`
      /* program-enrollment:insert-holder */
      INSERT INTO rewards_holders(identity_key,display_name,email,phone)
      VALUES($1,$2,$3,$4)
      RETURNING id,identity_key,display_name,email,phone,active
    `,[identityKey,config.holder.displayName,config.holder.email,config.holder.phone]);
    if (insertedHolder.rowCount !== 1) fail('HOLDER_INSERT_FAILED');
    holder = insertedHolder.rows[0];
    verifyHolder(holder,config,identityKey);
    holderCreated = true;
  }

  if (alreadyApplied) {
    const order = orderResult.rows[0];
    const program = programResult.rows[0];
    verifyOrder(order,config,holder.id);
    verifyProgram(program,config,holder.id,order.id);
    if (
      physicalResult.rowCount !== 1
      || physicalResult.rows[0].id !== program.id
    ) fail('PHYSICAL_SEAT_CONFLICT');
    const attendanceResult = await guardedQuery(client,'DB_ATTENDANCE_READ_FAILED',`
      /* program-enrollment:attendance */
      SELECT program_id,game_id,first_import_id,scanned_at,barcode
      FROM rewards_attendance
      WHERE program_id=$1 AND game_id=ANY($2::uuid[])
      ORDER BY game_id
      FOR UPDATE
    `,[program.id,historicalImports.map((item) => item.game_id)]);
    verifyExistingAttendance(attendanceResult.rows,historicalImports);
    return {
      status:'already_applied',
      programId:program.id,
      attendanceCount:historicalImports.length
    };
  }

  const insertedOrder = await guardedQuery(client,'DB_ORDER_INSERT_FAILED',`
    /* program-enrollment:insert-order */
    INSERT INTO rewards_orders(
      season_code,order_number,purchase_code,buyer_holder_id,seller,discount_label,
      purchased_at,payment_type,source_event,active
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
    RETURNING id,season_code,order_number,purchase_code,buyer_holder_id,seller,
              discount_label,purchased_at,payment_type,source_event,active
  `,[
    config.seasonCode,
    config.order.orderNumber,
    config.order.purchaseCode,
    holder.id,
    config.order.seller,
    config.order.discountLabel,
    config.order.purchasedAt,
    config.order.paymentType,
    config.order.sourceEvent
  ]);
  if (insertedOrder.rowCount !== 1) fail('ORDER_INSERT_FAILED');
  const order = insertedOrder.rows[0];
  verifyOrder(order,config,holder.id);

  const insertedProgram = await guardedQuery(client,'DB_PROGRAM_INSERT_FAILED',`
    /* program-enrollment:insert-program */
    INSERT INTO rewards_programs(
      season_code,order_number,purchase_code,holder_name,holder_email,holder_phone,
      zone,section,seat,barcode,source_event,segment,eligibility_status,
      eligibility_exception,manual_lock,active,holder_id,order_id,source_reference
    )
    VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'eligible',
      $13,true,true,$14,$15,$16
    )
    RETURNING id,season_code,order_number,purchase_code,holder_name,holder_email,
              holder_phone,zone,section,seat,barcode,source_event,segment,
              eligibility_status,eligibility_exception,manual_lock,active,
              holder_id,order_id,source_reference
  `,[
    config.seasonCode,
    config.order.orderNumber,
    config.order.purchaseCode,
    config.holder.displayName,
    config.holder.email,
    config.holder.phone,
    config.program.zone,
    config.program.section,
    config.program.seat,
    config.program.barcode,
    config.order.sourceEvent,
    config.program.segment,
    config.reasonCode,
    holder.id,
    order.id,
    config.program.sourceReference
  ]);
  if (insertedProgram.rowCount !== 1) fail('PROGRAM_INSERT_FAILED');
  const program = insertedProgram.rows[0];
  verifyProgram(program,config,holder.id,order.id);

  for (const attendance of historicalImports) {
    const insertedAttendance = await guardedQuery(client,'DB_ATTENDANCE_INSERT_FAILED',`
      /* program-enrollment:insert-attendance */
      INSERT INTO rewards_attendance(program_id,game_id,first_import_id,scanned_at,barcode)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(program_id,game_id) DO NOTHING
      RETURNING id
    `,[
      program.id,
      attendance.game_id,
      attendance.import_id,
      attendance.scannedAt,
      attendance.barcode
    ]);
    if (insertedAttendance.rowCount !== 1) fail('ATTENDANCE_INSERT_FAILED');
  }

  const auditResult = await guardedQuery(client,'DB_AUDIT_WRITE_FAILED',`
    /* program-enrollment:audit */
    INSERT INTO rewards_audit(action,entity_type,entity_id,reason,metadata)
    VALUES(
      'program.exception_enrolled','program',$1,'Authorized exceptional enrollment',
      jsonb_build_object(
        'reasonCode',$2::text,
        'historicalAttendanceCount',$3::integer
      )
    )
  `,[program.id,config.reasonCode,historicalImports.length]);
  if (auditResult.rowCount !== 1) fail('AUDIT_WRITE_FAILED');

  return {
    status:'applied',
    programId:program.id,
    attendanceCount:historicalImports.length,
    holderCreated
  };
}
