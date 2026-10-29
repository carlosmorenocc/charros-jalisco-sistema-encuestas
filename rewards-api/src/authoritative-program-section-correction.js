const TOP_LEVEL_FIELDS = new Set([
  'version',
  'seasonCode',
  'expectedProgramCount',
  'reasonCode',
  'programs'
]);
const PROGRAM_FIELDS = new Set([
  'programId',
  'permanentKey',
  'orderNumber',
  'expectedSegment',
  'zone',
  'fromSection',
  'toSection',
  'seat'
]);
const REASON_CODES = new Set(['boleto-movil-verified']);
const SEGMENTS = new Set(['VIP','PREFERENTE','GENERAL']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CORRECTION_ERROR_CODES = new Set([
  'CONFIG_JSON_INVALID',
  'CONFIG_PAYLOAD_INVALID',
  'CONFIG_UNSUPPORTED_FIELD',
  'CONFIG_VERSION_INVALID',
  'CONFIG_FIELD_TYPE_INVALID',
  'CONFIG_FIELD_FORMAT_INVALID',
  'CONFIG_PROGRAM_COUNT_INVALID',
  'CONFIG_PROGRAMS_INVALID',
  'CONFIG_PROGRAM_DUPLICATE',
  'CONFIG_LOCATION_DUPLICATE',
  'CONFIG_SECTION_UNCHANGED',
  'CONFIG_SEGMENT_INVALID',
  'CONFIG_REASON_INVALID',
  'DB_LOCK_FAILED',
  'DB_PROGRAMS_READ_FAILED',
  'DB_ORDERS_READ_FAILED',
  'DB_UNIQUE_CONFLICT_READ_FAILED',
  'DB_PHYSICAL_CONFLICT_READ_FAILED',
  'DB_ALIAS_CONFLICT_READ_FAILED',
  'DB_PROGRAM_UPDATE_FAILED',
  'DB_AUDIT_WRITE_FAILED',
  'PROGRAM_COUNT_MISMATCH',
  'PROGRAM_IDENTITY_MISMATCH',
  'PROGRAM_ORDER_MISMATCH',
  'PROGRAM_STATE_MISMATCH',
  'PROGRAM_STATE_MIXED',
  'TARGET_CORRECTION_INCOMPLETE',
  'PHYSICAL_SEAT_CONFLICT',
  'TARGET_UNIQUE_KEY_CONFLICT',
  'ALIAS_KEY_CONFLICT',
  'PROGRAM_UPDATE_FAILED',
  'AUDIT_WRITE_FAILED'
]);

export class AuthoritativeProgramSectionCorrectionError extends Error {
  constructor(code) {
    super('Authoritative program section correction validation failed.');
    this.name = 'AuthoritativeProgramSectionCorrectionError';
    this.code = CORRECTION_ERROR_CODES.has(code) ? code : 'CORRECTION_VALIDATION_FAILED';
  }
}

function fail(code) {
  throw new AuthoritativeProgramSectionCorrectionError(code);
}

async function guardedQuery(client,failureCode,sql,params = []) {
  try {
    return await client.query(sql,params);
  } catch (error) {
    if (error instanceof AuthoritativeProgramSectionCorrectionError) throw error;
    fail(failureCode);
  }
}

export function safeProgramSectionCorrectionFailureLog(error) {
  if (
    error instanceof AuthoritativeProgramSectionCorrectionError
    && CORRECTION_ERROR_CODES.has(error.code)
  ) {
    return `Authoritative program section correction failed [${error.code}]; no correction was committed.`;
  }
  return 'Authoritative program section correction failed [UNEXPECTED_ERROR]; no correction was committed.';
}

function textField(value,maxLength = 200) {
  if (typeof value !== 'string') fail('CONFIG_FIELD_TYPE_INVALID');
  const normalized = value.normalize('NFC').trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001F\u007F]/u.test(normalized)) {
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

function parseProgram(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('CONFIG_PROGRAMS_INVALID');
  }
  if (Object.keys(value).some((field) => !PROGRAM_FIELDS.has(field))) {
    fail('CONFIG_UNSUPPORTED_FIELD');
  }
  const program = {
    programId:uuidField(value.programId),
    permanentKey:uuidField(value.permanentKey),
    orderNumber:textField(value.orderNumber,100),
    expectedSegment:textField(value.expectedSegment,20).toUpperCase(),
    zone:textField(value.zone,100),
    fromSection:textField(value.fromSection,100),
    toSection:textField(value.toSection,100),
    seat:textField(value.seat,100)
  };
  if ([
    program.orderNumber,
    program.zone,
    program.fromSection,
    program.toSection,
    program.seat
  ].some((field) => !canonicalToken(field))) {
    fail('CONFIG_FIELD_FORMAT_INVALID');
  }
  if (!SEGMENTS.has(program.expectedSegment)) fail('CONFIG_SEGMENT_INVALID');
  if (canonicalToken(program.fromSection) === canonicalToken(program.toSection)) {
    fail('CONFIG_SECTION_UNCHANGED');
  }
  return program;
}

export function parseAuthoritativeProgramSectionCorrection(rawValue) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') return null;
  let value;
  try {
    value = JSON.parse(String(rawValue));
  } catch {
    fail('CONFIG_JSON_INVALID');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('CONFIG_PAYLOAD_INVALID');
  }
  if (Object.keys(value).some((field) => !TOP_LEVEL_FIELDS.has(field))) {
    fail('CONFIG_UNSUPPORTED_FIELD');
  }
  if (value.version !== 1) fail('CONFIG_VERSION_INVALID');

  const seasonCode = textField(value.seasonCode,32).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/u.test(seasonCode)) {
    fail('CONFIG_FIELD_FORMAT_INVALID');
  }
  if (
    !Number.isInteger(value.expectedProgramCount)
    || value.expectedProgramCount < 1
    || value.expectedProgramCount > 1000
  ) {
    fail('CONFIG_PROGRAM_COUNT_INVALID');
  }
  if (!Array.isArray(value.programs) || value.programs.length !== value.expectedProgramCount) {
    fail('CONFIG_PROGRAMS_INVALID');
  }
  const reasonCode = textField(value.reasonCode,80).toLowerCase();
  if (!REASON_CODES.has(reasonCode)) fail('CONFIG_REASON_INVALID');
  const programs = value.programs.map(parseProgram);

  const programIds = new Set();
  const permanentKeys = new Set();
  const sourceKeys = new Set();
  const targetKeys = new Set();
  for (const program of programs) {
    if (programIds.has(program.programId) || permanentKeys.has(program.permanentKey)) {
      fail('CONFIG_PROGRAM_DUPLICATE');
    }
    programIds.add(program.programId);
    permanentKeys.add(program.permanentKey);
    const sourceKey = [
      program.orderNumber,program.zone,program.fromSection,program.seat
    ].map(canonicalToken).join('|');
    const targetKey = [program.zone,program.toSection,program.seat]
      .map(canonicalToken).join('|');
    if (sourceKeys.has(sourceKey) || targetKeys.has(targetKey)) {
      fail('CONFIG_LOCATION_DUPLICATE');
    }
    sourceKeys.add(sourceKey);
    targetKeys.add(targetKey);
  }

  return {
    version:1,
    seasonCode,
    expectedProgramCount:value.expectedProgramCount,
    reasonCode,
    programs
  };
}

function sameProgramIdentity(row,program,seasonCode) {
  return String(row.id || '').toLowerCase() === program.programId
    && String(row.permanent_key || '').toLowerCase() === program.permanentKey
    && row.season_code === seasonCode
    && row.order_number === program.orderNumber
    && row.segment === program.expectedSegment
    && row.zone === program.zone
    && row.seat === program.seat
    && row.active === true
    && row.eligibility_status === 'eligible';
}

function rowMap(rows) {
  return new Map(rows.map((row) => [String(row.id || '').toLowerCase(),row]));
}

function correctionRows(config) {
  return config.programs.map((program) => ({
    program_id:program.programId,
    order_number:program.orderNumber,
    expected_segment:program.expectedSegment,
    zone:program.zone,
    from_section:program.fromSection,
    to_section:program.toSection,
    seat:program.seat
  }));
}

export async function applyAuthoritativeProgramSectionCorrection(client,config) {
  if (!config) return { status:'disabled',programCount:0 };
  await guardedQuery(
    client,
    'DB_LOCK_FAILED',
    "/* program-section-correction:lock */ SELECT pg_advisory_xact_lock(hashtext('rewards-program-section-correction:' || $1))",
    [config.seasonCode]
  );

  const ids = config.programs.map((program) => program.programId);
  const programsResult = await guardedQuery(client,'DB_PROGRAMS_READ_FAILED',`
    /* program-section-correction:programs */
    SELECT id,permanent_key,season_code,order_number,order_id,segment,
           zone,section,seat,active,eligibility_status,manual_lock
    FROM rewards_programs
    WHERE season_code=$1 AND id=ANY($2::uuid[])
    ORDER BY id
    FOR UPDATE
  `,[config.seasonCode,ids]);
  if (programsResult.rowCount !== config.expectedProgramCount) {
    fail('PROGRAM_COUNT_MISMATCH');
  }

  const rowsById = rowMap(programsResult.rows);
  const rows = config.programs.map((program) => rowsById.get(program.programId));
  if (rows.some((row,index) => !row || !sameProgramIdentity(
    row,config.programs[index],config.seasonCode
  ))) {
    fail('PROGRAM_IDENTITY_MISMATCH');
  }

  const orderIds = [...new Set(rows.map((row) => (
    row.order_id ? String(row.order_id).toLowerCase() : null
  )))];
  if (orderIds.includes(null)) fail('PROGRAM_ORDER_MISMATCH');
  const ordersResult = await guardedQuery(client,'DB_ORDERS_READ_FAILED',`
    /* program-section-correction:orders */
    SELECT id,season_code,order_number
    FROM rewards_orders
    WHERE id=ANY($1::uuid[])
    ORDER BY id
    FOR UPDATE
  `,[orderIds]);
  if (ordersResult.rowCount !== orderIds.length) fail('PROGRAM_ORDER_MISMATCH');
  const ordersById = new Map(ordersResult.rows.map((order) => [
    String(order.id || '').toLowerCase(),order
  ]));
  if (rows.some((row,index) => {
    const linkedOrder = ordersById.get(String(row.order_id || '').toLowerCase());
    return !linkedOrder
      || linkedOrder.season_code !== config.seasonCode
      || linkedOrder.order_number !== config.programs[index].orderNumber;
  })) fail('PROGRAM_ORDER_MISMATCH');

  const sourceCount = rows.filter((row,index) => (
    row.section === config.programs[index].fromSection
  )).length;
  const targetCount = rows.filter((row,index) => (
    row.section === config.programs[index].toSection
  )).length;
  let state;
  if (sourceCount === config.expectedProgramCount) state = 'applying';
  else if (targetCount === config.expectedProgramCount) {
    if (rows.some((row) => row.manual_lock !== true)) {
      fail('TARGET_CORRECTION_INCOMPLETE');
    }
    state = 'already_applied';
  } else if (sourceCount + targetCount === config.expectedProgramCount) {
    fail('PROGRAM_STATE_MIXED');
  } else fail('PROGRAM_STATE_MISMATCH');

  const serializedCorrections = JSON.stringify(correctionRows(config));
  const physicalConflicts = await guardedQuery(
    client,
    'DB_PHYSICAL_CONFLICT_READ_FAILED',
    `
      /* program-section-correction:physical-conflicts */
      WITH corrections AS (
        SELECT *
        FROM jsonb_to_recordset($2::jsonb) AS correction(
          program_id uuid,
          order_number text,
          expected_segment text,
          zone text,
          from_section text,
          to_section text,
          seat text
        )
      )
      SELECT correction.program_id target_program_id,p.id conflicting_program_id
      FROM corrections correction
      JOIN rewards_programs p
        ON p.season_code=$1
       AND p.id<>correction.program_id
       AND p.active
       AND p.eligibility_status='eligible'
       AND regexp_replace(upper(p.zone),'[^A-Z0-9]','','g')=
           regexp_replace(upper(correction.zone),'[^A-Z0-9]','','g')
       AND regexp_replace(upper(p.section),'[^A-Z0-9]','','g')=
           regexp_replace(upper(correction.to_section),'[^A-Z0-9]','','g')
       AND regexp_replace(upper(p.seat),'[^A-Z0-9]','','g')=
           regexp_replace(upper(correction.seat),'[^A-Z0-9]','','g')
      ORDER BY correction.program_id,p.id
      FOR UPDATE OF p
    `,
    [config.seasonCode,serializedCorrections]
  );
  if (physicalConflicts.rowCount !== 0) fail('PHYSICAL_SEAT_CONFLICT');

  const uniqueKeyConflicts = await guardedQuery(
    client,
    'DB_UNIQUE_CONFLICT_READ_FAILED',
    `
      /* program-section-correction:unique-conflicts */
      WITH corrections AS (
        SELECT *
        FROM jsonb_to_recordset($2::jsonb) AS correction(
          program_id uuid,
          order_number text,
          expected_segment text,
          zone text,
          from_section text,
          to_section text,
          seat text
        )
      )
      SELECT correction.program_id target_program_id,p.id conflicting_program_id
      FROM corrections correction
      JOIN rewards_programs p
        ON p.season_code=$1
       AND p.id<>correction.program_id
       AND regexp_replace(upper(p.order_number),'[^A-Z0-9]','','g')=
           regexp_replace(upper(correction.order_number),'[^A-Z0-9]','','g')
       AND regexp_replace(upper(p.zone),'[^A-Z0-9]','','g')=
           regexp_replace(upper(correction.zone),'[^A-Z0-9]','','g')
       AND regexp_replace(upper(p.section),'[^A-Z0-9]','','g')=
           regexp_replace(upper(correction.to_section),'[^A-Z0-9]','','g')
       AND regexp_replace(upper(p.seat),'[^A-Z0-9]','','g')=
           regexp_replace(upper(correction.seat),'[^A-Z0-9]','','g')
      ORDER BY correction.program_id,p.id
      FOR UPDATE OF p
    `,
    [config.seasonCode,serializedCorrections]
  );
  if (uniqueKeyConflicts.rowCount !== 0) fail('TARGET_UNIQUE_KEY_CONFLICT');

  const aliasConflicts = await guardedQuery(
    client,
    'DB_ALIAS_CONFLICT_READ_FAILED',
    `
      /* program-section-correction:alias-conflicts */
      WITH corrections AS (
        SELECT *
        FROM jsonb_to_recordset($2::jsonb) AS correction(
          program_id uuid,
          order_number text,
          expected_segment text,
          zone text,
          from_section text,
          to_section text,
          seat text
        )
      )
      SELECT correction.program_id target_program_id,
             program_alias.id conflicting_alias_id,
             program_alias.program_id conflicting_program_id
      FROM corrections correction
      JOIN rewards_program_aliases program_alias
        ON program_alias.season_code=$1
       AND program_alias.active
       AND program_alias.program_id<>correction.program_id
       AND regexp_replace(upper(program_alias.historical_order_number),'[^A-Z0-9]','','g')=
           regexp_replace(upper(correction.order_number),'[^A-Z0-9]','','g')
       AND regexp_replace(upper(program_alias.historical_zone),'[^A-Z0-9]','','g')=
           regexp_replace(upper(correction.zone),'[^A-Z0-9]','','g')
       AND regexp_replace(upper(program_alias.historical_section),'[^A-Z0-9]','','g')=
           regexp_replace(upper(correction.to_section),'[^A-Z0-9]','','g')
       AND regexp_replace(upper(program_alias.historical_seat),'[^A-Z0-9]','','g')=
           regexp_replace(upper(correction.seat),'[^A-Z0-9]','','g')
      ORDER BY correction.program_id,program_alias.id
      FOR UPDATE OF program_alias
    `,
    [config.seasonCode,serializedCorrections]
  );
  if (aliasConflicts.rowCount !== 0) fail('ALIAS_KEY_CONFLICT');

  if (state === 'already_applied') {
    return { status:'already_applied',programCount:config.expectedProgramCount };
  }

  const updateResult = await guardedQuery(client,'DB_PROGRAM_UPDATE_FAILED',`
    /* program-section-correction:update-programs */
    WITH corrections AS (
      SELECT *
      FROM jsonb_to_recordset($2::jsonb) AS correction(
        program_id uuid,
        order_number text,
        expected_segment text,
        zone text,
        from_section text,
        to_section text,
        seat text
      )
    ), updated AS (
      UPDATE rewards_programs program
      SET section=correction.to_section,manual_lock=true,updated_at=now()
      FROM corrections correction
      WHERE program.id=correction.program_id
        AND program.season_code=$1
        AND program.order_number=correction.order_number
        AND program.segment=correction.expected_segment
        AND program.zone=correction.zone
        AND program.section=correction.from_section
        AND program.seat=correction.seat
        AND program.active
        AND program.eligibility_status='eligible'
      RETURNING program.id
    )
    SELECT id FROM updated ORDER BY id
  `,[config.seasonCode,serializedCorrections]);
  if (updateResult.rowCount !== config.expectedProgramCount) fail('PROGRAM_UPDATE_FAILED');
  const updatedIds = new Set(updateResult.rows.map((row) => String(row.id || '').toLowerCase()));
  if (ids.some((id) => !updatedIds.has(id))) fail('PROGRAM_UPDATE_FAILED');

  const auditResult = await guardedQuery(client,'DB_AUDIT_WRITE_FAILED',`
    /* program-section-correction:audit */
    INSERT INTO rewards_audit(action,entity_type,entity_id,reason,metadata)
    SELECT
      'roster.authoritative_section_correction',
      'program',
      corrected_program_id::text,
      'Verified authoritative roster correction',
      jsonb_build_object('field','section','reasonCode',$2::text)
    FROM unnest($1::uuid[]) AS corrected_program(corrected_program_id)
    RETURNING entity_id
  `,[ids,config.reasonCode]);
  if (auditResult.rowCount !== config.expectedProgramCount) fail('AUDIT_WRITE_FAILED');

  return { status:'applied',programCount:config.expectedProgramCount };
}
