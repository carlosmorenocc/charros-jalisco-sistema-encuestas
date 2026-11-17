const TOP_LEVEL_FIELDS = new Set([
  'version',
  'seasonCode',
  'reasonCode',
  'orderNumber',
  'segment',
  'zone',
  'section',
  'gamePlayedOn',
  'expectedSourceScannedAt',
  'expectedSourceVisitCount',
  'expectedTargetVisitCount',
  'source',
  'target'
]);
const PROGRAM_FIELDS = new Set(['programId','seat']);
const REASON_CODES = new Set(['verified-missed-scan']);
const SEGMENTS = new Set(['VIP','PREFERENTE','GENERAL']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const ISO_TIMESTAMP_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/iu;
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/u;

const CORRECTION_ERROR_CODES = new Set([
  'CONFIG_JSON_INVALID',
  'CONFIG_PAYLOAD_INVALID',
  'CONFIG_UNSUPPORTED_FIELD',
  'CONFIG_VERSION_INVALID',
  'CONFIG_FIELD_TYPE_INVALID',
  'CONFIG_FIELD_FORMAT_INVALID',
  'CONFIG_PROGRAM_INVALID',
  'CONFIG_PROGRAM_DUPLICATE',
  'CONFIG_SEGMENT_INVALID',
  'CONFIG_REASON_INVALID',
  'CONFIG_DATE_INVALID',
  'CONFIG_TIMESTAMP_INVALID',
  'CONFIG_VISIT_COUNT_INVALID',
  'DB_LOCK_FAILED',
  'DB_PROGRAMS_READ_FAILED',
  'DB_ORDER_READ_FAILED',
  'DB_GAME_READ_FAILED',
  'DB_ATTENDANCE_READ_FAILED',
  'DB_SOURCE_IMPORT_READ_FAILED',
  'DB_AUDIT_READ_FAILED',
  'DB_ATTENDANCE_INSERT_FAILED',
  'DB_AUDIT_WRITE_FAILED',
  'DB_POSTCONDITION_READ_FAILED',
  'PROGRAM_COUNT_MISMATCH',
  'PROGRAM_IDENTITY_MISMATCH',
  'PROGRAM_RELATION_MISMATCH',
  'ORDER_STATE_MISMATCH',
  'GAME_STATE_MISMATCH',
  'SOURCE_ATTENDANCE_MISMATCH',
  'ATTENDANCE_COUNT_MISMATCH',
  'ATTENDANCE_SET_MISMATCH',
  'TARGET_ATTENDANCE_CONFLICT',
  'SOURCE_IMPORT_MISMATCH',
  'AUDIT_STATE_MISMATCH',
  'ATTENDANCE_INSERT_FAILED',
  'AUDIT_WRITE_FAILED',
  'POSTCONDITION_MISMATCH'
]);

export class AttendanceCorrectionError extends Error {
  constructor(code) {
    super('Attendance correction validation failed.');
    this.name = 'AttendanceCorrectionError';
    this.code = CORRECTION_ERROR_CODES.has(code) ? code : 'CORRECTION_VALIDATION_FAILED';
  }
}

function fail(code) {
  throw new AttendanceCorrectionError(code);
}

async function guardedQuery(client,failureCode,sql,params = []) {
  try {
    return await client.query(sql,params);
  } catch (error) {
    if (error instanceof AttendanceCorrectionError) throw error;
    fail(failureCode);
  }
}

export function safeAttendanceCorrectionFailureLog(error) {
  if (error instanceof AttendanceCorrectionError && CORRECTION_ERROR_CODES.has(error.code)) {
    return `Attendance correction failed [${error.code}]; no correction was committed.`;
  }
  return 'Attendance correction failed [UNEXPECTED_ERROR]; no correction was committed.';
}

export function safeAttendanceCorrectionSuccessLog(status) {
  if (!['applied','already_applied'].includes(status)) {
    throw new Error('Unexpected attendance correction status.');
  }
  return `Attendance correction completed [${status}].`;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertAllowedFields(value,allowed) {
  if (Object.keys(value).some((field) => !allowed.has(field))) {
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

function programField(value) {
  if (!isPlainObject(value)) fail('CONFIG_PROGRAM_INVALID');
  assertAllowedFields(value,PROGRAM_FIELDS);
  const program = {
    programId:uuidField(value.programId),
    seat:textField(value.seat,100)
  };
  if (!canonicalToken(program.seat)) fail('CONFIG_FIELD_FORMAT_INVALID');
  return program;
}

export function parseAttendanceCorrection(rawValue) {
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
  if (![orderNumber,zone,section].every(canonicalToken)) fail('CONFIG_FIELD_FORMAT_INVALID');
  const gamePlayedOn = dateField(value.gamePlayedOn);
  const expectedSourceScannedAt = timestampField(
    value.expectedSourceScannedAt,
    gamePlayedOn
  );
  const expectedSourceVisitCount = visitCountField(value.expectedSourceVisitCount);
  const expectedTargetVisitCount = visitCountField(value.expectedTargetVisitCount);
  if (expectedSourceVisitCount !== expectedTargetVisitCount + 1) {
    fail('CONFIG_VISIT_COUNT_INVALID');
  }
  const source = programField(value.source);
  const target = programField(value.target);
  if (
    source.programId === target.programId
    || canonicalToken(source.seat) === canonicalToken(target.seat)
  ) fail('CONFIG_PROGRAM_DUPLICATE');

  return {
    version:1,
    seasonCode,
    reasonCode,
    orderNumber,
    segment,
    zone,
    section,
    gamePlayedOn,
    expectedSourceScannedAt,
    expectedSourceVisitCount,
    expectedTargetVisitCount,
    source,
    target
  };
}

function sameTimestamp(left,right) {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function sameProgramIdentity(row,expected,config) {
  return String(row?.id || '').toLowerCase() === expected.programId
    && row.season_code === config.seasonCode
    && row.order_number === config.orderNumber
    && row.segment === config.segment
    && row.zone === config.zone
    && row.section === config.section
    && row.seat === expected.seat
    && row.active === true
    && row.eligibility_status === 'eligible';
}

function attendanceByProgram(rows,programId) {
  return rows.filter((row) => String(row.program_id || '').toLowerCase() === programId);
}

function gameIds(rows) {
  return new Set(rows.map((row) => String(row.game_id || '').toLowerCase()));
}

function setDifference(left,right) {
  return [...left].filter((value) => !right.has(value));
}

function auditMetadataMatches(row,config,gameId) {
  const metadata = row?.metadata;
  return metadata
    && metadata.reasonCode === config.reasonCode
    && String(metadata.sourceProgramId || '').toLowerCase() === config.source.programId
    && String(metadata.gameId || '').toLowerCase() === gameId;
}

export async function applyAttendanceCorrection(client,config) {
  if (!config) return { status:'disabled',sourceVisitCount:0,targetVisitCount:0 };
  await guardedQuery(
    client,
    'DB_LOCK_FAILED',
    "/* attendance-correction:lock */ SELECT pg_advisory_xact_lock(hashtext('rewards-attendance-correction:' || $1 || ':' || $2))",
    [config.seasonCode,config.orderNumber]
  );

  const programIds = [config.source.programId,config.target.programId].sort();
  const programsResult = await guardedQuery(client,'DB_PROGRAMS_READ_FAILED',`
    /* attendance-correction:programs */
    SELECT id,season_code,order_number,holder_id,order_id,segment,
           zone,section,seat,active,eligibility_status
    FROM rewards_programs
    WHERE season_code=$1 AND id=ANY($2::uuid[])
    ORDER BY id
    FOR UPDATE
  `,[config.seasonCode,programIds]);
  if (programsResult.rowCount !== 2) fail('PROGRAM_COUNT_MISMATCH');
  const programsById = new Map(programsResult.rows.map((row) => [
    String(row.id || '').toLowerCase(),row
  ]));
  const sourceProgram = programsById.get(config.source.programId);
  const targetProgram = programsById.get(config.target.programId);
  if (
    !sameProgramIdentity(sourceProgram,config.source,config)
    || !sameProgramIdentity(targetProgram,config.target,config)
  ) fail('PROGRAM_IDENTITY_MISMATCH');
  if (
    !sourceProgram.holder_id
    || !targetProgram.holder_id
    || !sourceProgram.order_id
    || !targetProgram.order_id
    || sourceProgram.order_id !== targetProgram.order_id
  ) fail('PROGRAM_RELATION_MISMATCH');

  const orderResult = await guardedQuery(client,'DB_ORDER_READ_FAILED',`
    /* attendance-correction:order */
    SELECT id,season_code,order_number,active
    FROM rewards_orders
    WHERE id=$1
    FOR UPDATE
  `,[sourceProgram.order_id]);
  if (
    orderResult.rowCount !== 1
    || String(orderResult.rows[0].id || '').toLowerCase()
      !== String(sourceProgram.order_id).toLowerCase()
    || orderResult.rows[0].season_code !== config.seasonCode
    || orderResult.rows[0].order_number !== config.orderNumber
    || orderResult.rows[0].active !== true
  ) fail('ORDER_STATE_MISMATCH');

  const gameResult = await guardedQuery(client,'DB_GAME_READ_FAILED',`
    /* attendance-correction:game */
    SELECT id,played_on::text played_on,report_status
    FROM rewards_games
    WHERE played_on=$1::date
    FOR UPDATE
  `,[config.gamePlayedOn]);
  if (
    gameResult.rowCount !== 1
    || gameResult.rows[0].played_on !== config.gamePlayedOn
    || !['partial','closed'].includes(gameResult.rows[0].report_status)
  ) fail('GAME_STATE_MISMATCH');
  const gameId = String(gameResult.rows[0].id || '').toLowerCase();

  const attendanceResult = await guardedQuery(client,'DB_ATTENDANCE_READ_FAILED',`
    /* attendance-correction:attendance */
    SELECT id,program_id,game_id,first_import_id,scanned_at,barcode
    FROM rewards_attendance
    WHERE program_id=ANY($1::uuid[])
    ORDER BY program_id,game_id
    FOR UPDATE
  `,[programIds]);
  const sourceAttendance = attendanceByProgram(
    attendanceResult.rows,
    config.source.programId
  );
  const targetAttendance = attendanceByProgram(
    attendanceResult.rows,
    config.target.programId
  );
  if (sourceAttendance.length !== config.expectedSourceVisitCount) {
    fail('ATTENDANCE_COUNT_MISMATCH');
  }
  const sourceGameAttendance = sourceAttendance.find((row) => (
    String(row.game_id || '').toLowerCase() === gameId
  ));
  if (
    !sourceGameAttendance
    || !sameTimestamp(sourceGameAttendance.scanned_at,config.expectedSourceScannedAt)
    || !sourceGameAttendance.first_import_id
  ) fail('SOURCE_ATTENDANCE_MISMATCH');

  const sourceGames = gameIds(sourceAttendance);
  const targetGames = gameIds(targetAttendance);
  const sourceOnlyGames = setDifference(sourceGames,targetGames);
  const targetOnlyGames = setDifference(targetGames,sourceGames);
  const targetGameAttendance = targetAttendance.find((row) => (
    String(row.game_id || '').toLowerCase() === gameId
  ));
  let state;
  if (targetAttendance.length === config.expectedTargetVisitCount) {
    if (
      targetGameAttendance
      || sourceOnlyGames.length !== 1
      || sourceOnlyGames[0] !== gameId
      || targetOnlyGames.length !== 0
    ) fail('ATTENDANCE_SET_MISMATCH');
    state = 'applying';
  } else if (targetAttendance.length === config.expectedSourceVisitCount) {
    if (
      !targetGameAttendance
      || sourceOnlyGames.length !== 0
      || targetOnlyGames.length !== 0
      || targetGameAttendance.first_import_id !== sourceGameAttendance.first_import_id
      || !sameTimestamp(targetGameAttendance.scanned_at,sourceGameAttendance.scanned_at)
      || targetGameAttendance.barcode !== null
    ) fail('TARGET_ATTENDANCE_CONFLICT');
    state = 'already_applied';
  } else fail('ATTENDANCE_COUNT_MISMATCH');

  const sourceImportResult = await guardedQuery(client,'DB_SOURCE_IMPORT_READ_FAILED',`
    /* attendance-correction:source-import */
    SELECT id,kind,game_id
    FROM rewards_imports
    WHERE id=$1
    FOR UPDATE
  `,[sourceGameAttendance.first_import_id]);
  if (
    sourceImportResult.rowCount !== 1
    || sourceImportResult.rows[0].kind !== 'access'
    || String(sourceImportResult.rows[0].game_id || '').toLowerCase() !== gameId
  ) fail('SOURCE_IMPORT_MISMATCH');

  const auditResult = await guardedQuery(client,'DB_AUDIT_READ_FAILED',`
    /* attendance-correction:audit-state */
    SELECT id,metadata
    FROM rewards_audit
    WHERE action='attendance.verified_missing_scan'
      AND entity_type='program'
      AND entity_id=$1
      AND metadata->>'gameId'=$2
    ORDER BY id
    FOR UPDATE
  `,[config.target.programId,gameId]);
  if (state === 'applying' && auditResult.rowCount !== 0) fail('AUDIT_STATE_MISMATCH');
  if (state === 'already_applied') {
    if (
      auditResult.rowCount !== 1
      || !auditMetadataMatches(auditResult.rows[0],config,gameId)
    ) fail('AUDIT_STATE_MISMATCH');
    return {
      status:'already_applied',
      sourceVisitCount:sourceAttendance.length,
      targetVisitCount:targetAttendance.length
    };
  }

  const insertResult = await guardedQuery(client,'DB_ATTENDANCE_INSERT_FAILED',`
    /* attendance-correction:insert-attendance */
    INSERT INTO rewards_attendance(program_id,game_id,first_import_id,scanned_at,barcode)
    VALUES($1,$2,$3,$4,NULL)
    ON CONFLICT(program_id,game_id) DO NOTHING
    RETURNING id
  `,[
    config.target.programId,
    gameId,
    sourceGameAttendance.first_import_id,
    sourceGameAttendance.scanned_at
  ]);
  if (insertResult.rowCount !== 1) fail('ATTENDANCE_INSERT_FAILED');

  const auditWriteResult = await guardedQuery(client,'DB_AUDIT_WRITE_FAILED',`
    /* attendance-correction:audit-write */
    INSERT INTO rewards_audit(action,entity_type,entity_id,reason,metadata)
    VALUES(
      'attendance.verified_missing_scan',
      'program',
      $1,
      'Verified missed scan correction',
      jsonb_build_object(
        'reasonCode',$2::text,
        'sourceProgramId',$3::text,
        'gameId',$4::text,
        'attendanceId',$5::text
      )
    )
    RETURNING id
  `,[
    config.target.programId,
    config.reasonCode,
    config.source.programId,
    gameId,
    insertResult.rows[0].id
  ]);
  if (auditWriteResult.rowCount !== 1) fail('AUDIT_WRITE_FAILED');

  const postconditionResult = await guardedQuery(
    client,
    'DB_POSTCONDITION_READ_FAILED',
    `
      /* attendance-correction:postcondition */
      SELECT id,program_id,game_id,first_import_id,scanned_at,barcode
      FROM rewards_attendance
      WHERE program_id=ANY($1::uuid[])
      ORDER BY program_id,game_id
      FOR UPDATE
    `,
    [programIds]
  );
  const finalSourceAttendance = attendanceByProgram(
    postconditionResult.rows,
    config.source.programId
  );
  const finalTargetAttendance = attendanceByProgram(
    postconditionResult.rows,
    config.target.programId
  );
  const finalSourceGames = gameIds(finalSourceAttendance);
  const finalTargetGames = gameIds(finalTargetAttendance);
  const finalTargetGameAttendance = finalTargetAttendance.find((row) => (
    String(row.game_id || '').toLowerCase() === gameId
  ));
  if (
    finalSourceAttendance.length !== config.expectedSourceVisitCount
    || finalTargetAttendance.length !== config.expectedSourceVisitCount
    || setDifference(finalSourceGames,finalTargetGames).length !== 0
    || setDifference(finalTargetGames,finalSourceGames).length !== 0
    || !finalTargetGameAttendance
    || finalTargetGameAttendance.first_import_id !== sourceGameAttendance.first_import_id
    || !sameTimestamp(finalTargetGameAttendance.scanned_at,sourceGameAttendance.scanned_at)
    || finalTargetGameAttendance.barcode !== null
  ) fail('POSTCONDITION_MISMATCH');

  return {
    status:'applied',
    sourceVisitCount:finalSourceAttendance.length,
    targetVisitCount:finalTargetAttendance.length
  };
}
