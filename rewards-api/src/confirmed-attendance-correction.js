const TOP_LEVEL_FIELDS = new Set([
  'version',
  'seasonCode',
  'reasonCode',
  'orderNumber',
  'segment',
  'zone',
  'section',
  'seat',
  'programId',
  'gamePlayedOn',
  'gameDisplayName',
  'scannedAt',
  'expectedVisitCountBefore',
  'expectedVisitCountAfter',
  'importSha256'
]);
const SEGMENTS = new Set(['VIP','PREFERENTE','GENERAL']);
const REASON_CODES = new Set(['staff-confirmed-unscanned-access']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^[0-9a-f]{64}$/iu;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const ISO_TIMESTAMP_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/iu;
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/u;

const ERROR_CODES = new Set([
  'CONFIG_JSON_INVALID',
  'CONFIG_PAYLOAD_INVALID',
  'CONFIG_UNSUPPORTED_FIELD',
  'CONFIG_VERSION_INVALID',
  'CONFIG_FIELD_TYPE_INVALID',
  'CONFIG_FIELD_FORMAT_INVALID',
  'CONFIG_SEGMENT_INVALID',
  'CONFIG_REASON_INVALID',
  'CONFIG_DATE_INVALID',
  'CONFIG_TIMESTAMP_INVALID',
  'CONFIG_VISIT_COUNT_INVALID',
  'DB_LOCK_FAILED',
  'DB_PROGRAM_READ_FAILED',
  'DB_ORDER_READ_FAILED',
  'DB_GAME_READ_FAILED',
  'DB_IMPORT_READ_FAILED',
  'DB_ATTENDANCE_READ_FAILED',
  'DB_AUDIT_READ_FAILED',
  'DB_ATTENDANCE_INSERT_FAILED',
  'DB_AUDIT_WRITE_FAILED',
  'DB_POSTCONDITION_READ_FAILED',
  'PROGRAM_STATE_MISMATCH',
  'ORDER_STATE_MISMATCH',
  'GAME_STATE_MISMATCH',
  'IMPORT_STATE_MISMATCH',
  'ATTENDANCE_COUNT_MISMATCH',
  'TARGET_ATTENDANCE_CONFLICT',
  'AUDIT_STATE_MISMATCH',
  'ATTENDANCE_INSERT_FAILED',
  'AUDIT_WRITE_FAILED',
  'POSTCONDITION_MISMATCH'
]);

export class ConfirmedAttendanceCorrectionError extends Error {
  constructor(code) {
    super('Confirmed attendance correction validation failed.');
    this.name = 'ConfirmedAttendanceCorrectionError';
    this.code = ERROR_CODES.has(code) ? code : 'CORRECTION_VALIDATION_FAILED';
  }
}

function fail(code) {
  throw new ConfirmedAttendanceCorrectionError(code);
}

async function guardedQuery(client,failureCode,sql,params = []) {
  try {
    return await client.query(sql,params);
  } catch (error) {
    if (error instanceof ConfirmedAttendanceCorrectionError) throw error;
    fail(failureCode);
  }
}

export function safeConfirmedAttendanceFailureLog(error) {
  if (error instanceof ConfirmedAttendanceCorrectionError && ERROR_CODES.has(error.code)) {
    return `Confirmed attendance correction failed [${error.code}]; no correction was committed.`;
  }
  return 'Confirmed attendance correction failed [UNEXPECTED_ERROR]; no correction was committed.';
}

export function safeConfirmedAttendanceSuccessLog(status) {
  if (!['applied','already_applied'].includes(status)) {
    throw new Error('Unexpected confirmed attendance correction status.');
  }
  return `Confirmed attendance correction completed [${status}].`;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertAllowedFields(value) {
  if (Object.keys(value).some((field) => !TOP_LEVEL_FIELDS.has(field))) {
    fail('CONFIG_UNSUPPORTED_FIELD');
  }
}

function textField(value,maxLength = 200) {
  if (typeof value !== 'string') fail('CONFIG_FIELD_TYPE_INVALID');
  const normalized = value.normalize('NFC').replace(/\s+/gu,' ').trim();
  if (!normalized || normalized.length > maxLength || CONTROL_CHARACTER.test(normalized)) {
    fail('CONFIG_FIELD_FORMAT_INVALID');
  }
  return normalized;
}

function uuidField(value) {
  const normalized = textField(value,36).toLowerCase();
  if (!UUID.test(normalized)) fail('CONFIG_FIELD_FORMAT_INVALID');
  return normalized;
}

function sha256Field(value) {
  const normalized = textField(value,64).toLowerCase();
  if (!SHA256.test(normalized)) fail('CONFIG_FIELD_FORMAT_INVALID');
  return normalized;
}

function canonicalToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu,'')
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu,'');
}

function dateField(value) {
  const date = textField(value,10);
  const match = date.match(ISO_DATE);
  if (!match) fail('CONFIG_DATE_INVALID');
  const [,yearText,monthText,dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year,month - 1,day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) fail('CONFIG_DATE_INVALID');
  return date;
}

function timestampField(value,gamePlayedOn) {
  const timestamp = textField(value,50);
  if (!ISO_TIMESTAMP_WITH_ZONE.test(timestamp) || timestamp.slice(0,10) !== gamePlayedOn) {
    fail('CONFIG_TIMESTAMP_INVALID');
  }
  const candidate = new Date(timestamp);
  if (Number.isNaN(candidate.getTime())) fail('CONFIG_TIMESTAMP_INVALID');
  return candidate.toISOString();
}

function visitCountField(value) {
  if (!Number.isInteger(value) || value < 0 || value > 34) {
    fail('CONFIG_VISIT_COUNT_INVALID');
  }
  return value;
}

export function parseConfirmedAttendanceCorrection(rawValue) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') return null;
  let value;
  try {
    value = JSON.parse(String(rawValue));
  } catch {
    fail('CONFIG_JSON_INVALID');
  }
  if (!isPlainObject(value)) fail('CONFIG_PAYLOAD_INVALID');
  assertAllowedFields(value);
  if (value.version !== 1) fail('CONFIG_VERSION_INVALID');

  const seasonCode = textField(value.seasonCode,32).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/u.test(seasonCode)) {
    fail('CONFIG_FIELD_FORMAT_INVALID');
  }
  const reasonCode = textField(value.reasonCode,80).toLowerCase();
  if (!REASON_CODES.has(reasonCode)) fail('CONFIG_REASON_INVALID');
  const orderNumber = textField(value.orderNumber,100);
  const segment = textField(value.segment,20).toUpperCase();
  if (!SEGMENTS.has(segment)) fail('CONFIG_SEGMENT_INVALID');
  const zone = textField(value.zone,150);
  const section = textField(value.section,100);
  const seat = textField(value.seat,100);
  const gameDisplayName = textField(value.gameDisplayName,200);
  if (![orderNumber,zone,section,seat,gameDisplayName].every(canonicalToken)) {
    fail('CONFIG_FIELD_FORMAT_INVALID');
  }
  const gamePlayedOn = dateField(value.gamePlayedOn);
  const scannedAt = timestampField(value.scannedAt,gamePlayedOn);
  const expectedVisitCountBefore = visitCountField(value.expectedVisitCountBefore);
  const expectedVisitCountAfter = visitCountField(value.expectedVisitCountAfter);
  if (expectedVisitCountAfter !== expectedVisitCountBefore + 1) {
    fail('CONFIG_VISIT_COUNT_INVALID');
  }

  return {
    version:1,
    seasonCode,
    reasonCode,
    orderNumber,
    segment,
    zone,
    section,
    seat,
    programId:uuidField(value.programId),
    gamePlayedOn,
    gameDisplayName,
    scannedAt,
    expectedVisitCountBefore,
    expectedVisitCountAfter,
    importSha256:sha256Field(value.importSha256)
  };
}

function sameUuid(left,right) {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase();
}

function sameTimestamp(left,right) {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function auditMetadataMatches(row,config,gameId,importId,attendanceId) {
  const metadata = row?.metadata;
  return metadata
    && metadata.reasonCode === config.reasonCode
    && sameUuid(metadata.gameId,gameId)
    && sameUuid(metadata.importId,importId)
    && sameUuid(metadata.attendanceId,attendanceId);
}

function attendanceMatches(row,config,gameId,importId) {
  return row
    && sameUuid(row.program_id,config.programId)
    && sameUuid(row.game_id,gameId)
    && sameUuid(row.first_import_id,importId)
    && sameTimestamp(row.scanned_at,config.scannedAt)
    && row.barcode === null;
}

export async function applyConfirmedAttendanceCorrection(client,config) {
  if (!config) return { status:'disabled',visitCount:0 };

  await guardedQuery(
    client,
    'DB_LOCK_FAILED',
    "/* confirmed-attendance:lock */ SELECT pg_advisory_xact_lock(hashtext('rewards-confirmed-attendance:' || $1 || ':' || $2 || ':' || $3))",
    [config.seasonCode,config.programId,config.gamePlayedOn]
  );

  const programResult = await guardedQuery(client,'DB_PROGRAM_READ_FAILED',`
    /* confirmed-attendance:program */
    SELECT id,season_code,order_number,holder_id,order_id,segment,zone,section,seat,
           active,eligibility_status
    FROM rewards_programs
    WHERE season_code=$1 AND id=$2
    FOR UPDATE
  `,[config.seasonCode,config.programId]);
  const program = programResult.rows[0];
  if (
    programResult.rowCount !== 1
    || !sameUuid(program.id,config.programId)
    || program.season_code !== config.seasonCode
    || program.order_number !== config.orderNumber
    || program.segment !== config.segment
    || program.zone !== config.zone
    || program.section !== config.section
    || program.seat !== config.seat
    || program.active !== true
    || program.eligibility_status !== 'eligible'
    || !program.holder_id
    || !program.order_id
  ) fail('PROGRAM_STATE_MISMATCH');

  const orderResult = await guardedQuery(client,'DB_ORDER_READ_FAILED',`
    /* confirmed-attendance:order */
    SELECT id,season_code,order_number,active
    FROM rewards_orders
    WHERE id=$1
    FOR UPDATE
  `,[program.order_id]);
  const order = orderResult.rows[0];
  if (
    orderResult.rowCount !== 1
    || !sameUuid(order.id,program.order_id)
    || order.season_code !== config.seasonCode
    || order.order_number !== config.orderNumber
    || order.active !== true
  ) fail('ORDER_STATE_MISMATCH');

  const gameResult = await guardedQuery(client,'DB_GAME_READ_FAILED',`
    /* confirmed-attendance:game */
    SELECT id,played_on::text played_on,display_name,report_status
    FROM rewards_games
    WHERE played_on=$1::date
    FOR UPDATE
  `,[config.gamePlayedOn]);
  const game = gameResult.rows[0];
  if (
    gameResult.rowCount !== 1
    || game.played_on !== config.gamePlayedOn
    || game.display_name !== config.gameDisplayName
    || !['partial','closed'].includes(game.report_status)
  ) fail('GAME_STATE_MISMATCH');
  const gameId = String(game.id || '').toLowerCase();

  const importResult = await guardedQuery(client,'DB_IMPORT_READ_FAILED',`
    /* confirmed-attendance:import */
    SELECT id,kind,sha256,game_id,report_status
    FROM rewards_imports
    WHERE sha256=$1 AND kind='access'
    FOR UPDATE
  `,[config.importSha256]);
  const sourceImport = importResult.rows[0];
  if (
    importResult.rowCount !== 1
    || sourceImport.sha256 !== config.importSha256
    || sourceImport.kind !== 'access'
    || !sameUuid(sourceImport.game_id,gameId)
    || !['partial','closed'].includes(sourceImport.report_status)
  ) fail('IMPORT_STATE_MISMATCH');
  const importId = String(sourceImport.id || '').toLowerCase();

  const attendanceResult = await guardedQuery(client,'DB_ATTENDANCE_READ_FAILED',`
    /* confirmed-attendance:attendance */
    SELECT id,program_id,game_id,first_import_id,scanned_at,barcode
    FROM rewards_attendance
    WHERE program_id=$1
    ORDER BY game_id
    FOR UPDATE
  `,[config.programId]);
  const targetAttendance = attendanceResult.rows.find((row) => sameUuid(row.game_id,gameId));

  const auditResult = await guardedQuery(client,'DB_AUDIT_READ_FAILED',`
    /* confirmed-attendance:audit-state */
    SELECT id,metadata
    FROM rewards_audit
    WHERE action='attendance.staff_verified_access'
      AND entity_type='program'
      AND entity_id=$1
      AND metadata->>'gameId'=$2
    ORDER BY id
    FOR UPDATE
  `,[config.programId,gameId]);

  if (attendanceResult.rowCount === config.expectedVisitCountAfter) {
    if (
      !attendanceMatches(targetAttendance,config,gameId,importId)
      || auditResult.rowCount !== 1
      || !auditMetadataMatches(
        auditResult.rows[0],
        config,
        gameId,
        importId,
        targetAttendance.id
      )
    ) fail('TARGET_ATTENDANCE_CONFLICT');
    return { status:'already_applied',visitCount:attendanceResult.rowCount };
  }

  if (attendanceResult.rowCount !== config.expectedVisitCountBefore) {
    fail('ATTENDANCE_COUNT_MISMATCH');
  }
  if (targetAttendance) fail('TARGET_ATTENDANCE_CONFLICT');
  if (auditResult.rowCount !== 0) fail('AUDIT_STATE_MISMATCH');

  const insertResult = await guardedQuery(client,'DB_ATTENDANCE_INSERT_FAILED',`
    /* confirmed-attendance:insert */
    INSERT INTO rewards_attendance(program_id,game_id,first_import_id,scanned_at,barcode)
    VALUES($1,$2,$3,$4,NULL)
    ON CONFLICT(program_id,game_id) DO NOTHING
    RETURNING id
  `,[config.programId,gameId,importId,config.scannedAt]);
  if (insertResult.rowCount !== 1) fail('ATTENDANCE_INSERT_FAILED');
  const attendanceId = String(insertResult.rows[0].id || '').toLowerCase();

  const auditWriteResult = await guardedQuery(client,'DB_AUDIT_WRITE_FAILED',`
    /* confirmed-attendance:audit-write */
    INSERT INTO rewards_audit(action,entity_type,entity_id,reason,metadata)
    VALUES(
      'attendance.staff_verified_access',
      'program',
      $1,
      'Staff-confirmed unscanned access',
      jsonb_build_object(
        'reasonCode',$2::text,
        'gameId',$3::text,
        'importId',$4::text,
        'attendanceId',$5::text
      )
    )
    RETURNING id
  `,[config.programId,config.reasonCode,gameId,importId,attendanceId]);
  if (auditWriteResult.rowCount !== 1) fail('AUDIT_WRITE_FAILED');

  const postconditionResult = await guardedQuery(
    client,
    'DB_POSTCONDITION_READ_FAILED',
    `
      /* confirmed-attendance:postcondition */
      SELECT id,program_id,game_id,first_import_id,scanned_at,barcode
      FROM rewards_attendance
      WHERE program_id=$1
      ORDER BY game_id
      FOR UPDATE
    `,
    [config.programId]
  );
  const finalTarget = postconditionResult.rows.find((row) => sameUuid(row.game_id,gameId));
  if (
    postconditionResult.rowCount !== config.expectedVisitCountAfter
    || !attendanceMatches(finalTarget,config,gameId,importId)
    || !sameUuid(finalTarget.id,attendanceId)
  ) fail('POSTCONDITION_MISMATCH');

  return { status:'applied',visitCount:postconditionResult.rowCount };
}
