import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAuthoritativeProgramSectionCorrection,
  AuthoritativeProgramSectionCorrectionError,
  parseAuthoritativeProgramSectionCorrection,
  safeProgramSectionCorrectionFailureLog
} from '../src/authoritative-program-section-correction.js';

const seasonCode = 'TEST-2026';
const privateOrder = 'SYNTHETIC-ORDER-PRIVATE';
const privateZone = 'Synthetic Private Zone';
const privateSeat = 'SYNTHETIC-SEAT-1';
const orderIds = [
  '00000000-0000-4000-8000-000000000221',
  '00000000-0000-4000-8000-000000000222'
];
const programs = [
  {
    programId:'00000000-0000-4000-8000-000000000201',
    permanentKey:'00000000-0000-4000-8000-000000000211',
    orderNumber:privateOrder,
    expectedSegment:'VIP',
    zone:privateZone,
    fromSection:'SOURCE-A',
    toSection:'TARGET-A',
    seat:privateSeat
  },
  {
    programId:'00000000-0000-4000-8000-000000000202',
    permanentKey:'00000000-0000-4000-8000-000000000212',
    orderNumber:'SYNTHETIC-ORDER-2',
    expectedSegment:'PREFERENTE',
    zone:'Synthetic Zone 2',
    fromSection:'SOURCE-B',
    toSection:'TARGET-B',
    seat:'SYNTHETIC-SEAT-2'
  }
];

function rawCorrection(overrides = {}) {
  return JSON.stringify({
    version:1,
    seasonCode,
    expectedProgramCount:programs.length,
    reasonCode:'boleto-movil-verified',
    programs,
    ...overrides
  });
}

function correction(overrides) {
  return parseAuthoritativeProgramSectionCorrection(rawCorrection(overrides));
}

function assertCorrectionError(action,expectedCode) {
  assert.throws(action,(error) => (
    error instanceof AuthoritativeProgramSectionCorrectionError
    && error.code === expectedCode
    && error.message === 'Authoritative program section correction validation failed.'
  ));
}

function programRow(program,state = 'source',index = programs.indexOf(program)) {
  const section = state === 'target'
    ? program.toSection
    : state === 'unexpected'
      ? 'UNEXPECTED-SECTION'
      : program.fromSection;
  return {
    id:program.programId,
    permanent_key:program.permanentKey,
    season_code:seasonCode,
    order_number:program.orderNumber,
    order_id:orderIds[index],
    segment:program.expectedSegment,
    zone:program.zone,
    section,
    seat:program.seat,
    active:true,
    eligibility_status:'eligible',
    manual_lock:state === 'target'
  };
}

function fakeClient({
  state = 'source',
  rows:customRows,
  rowCount,
  orders:customOrders,
  physicalConflict = false,
  uniqueConflict = false,
  aliasConflict = false,
  updateRowCount = programs.length,
  updateIds = programs.map((program) => program.programId),
  auditRowCount = programs.length,
  throwAt = null
} = {}) {
  const calls = [];
  const rows = customRows || programs.map((program,index) => {
    const rowState = state === 'mixed' ? (index === 0 ? 'source' : 'target') : state;
    return programRow(program,rowState,index);
  });
  const orders = customOrders || programs.map((program,index) => ({
    id:orderIds[index],
    season_code:seasonCode,
    order_number:program.orderNumber
  }));
  return {
    calls,
    async query(sql,params = []) {
      const tag = sql.match(/program-section-correction:([a-z-]+)/u)?.[1];
      if (!tag) throw new Error('Missing synthetic query tag');
      calls.push({ tag,params,sql });
      if (tag === throwAt) {
        throw new Error(`${privateOrder} ${privateZone} ${privateSeat}`);
      }
      if (tag === 'lock') return { rowCount:1,rows:[] };
      if (tag === 'programs') {
        return {
          rowCount:rowCount ?? rows.length,
          rows
        };
      }
      if (tag === 'orders') return { rowCount:orders.length,rows:orders };
      if (tag === 'physical-conflicts') {
        return physicalConflict
          ? { rowCount:1,rows:[{ target_program_id:programs[0].programId }] }
          : { rowCount:0,rows:[] };
      }
      if (tag === 'unique-conflicts') {
        return uniqueConflict
          ? { rowCount:1,rows:[{ target_program_id:programs[0].programId }] }
          : { rowCount:0,rows:[] };
      }
      if (tag === 'alias-conflicts') {
        return aliasConflict
          ? { rowCount:1,rows:[{ target_program_id:programs[0].programId }] }
          : { rowCount:0,rows:[] };
      }
      if (tag === 'update-programs') {
        return {
          rowCount:updateRowCount,
          rows:updateIds.map((id) => ({ id }))
        };
      }
      if (tag === 'audit') {
        return {
          rowCount:auditRowCount,
          rows:Array.from({ length:auditRowCount },(_,index) => ({ entity_id:String(index) }))
        };
      }
      throw new Error(`Unexpected synthetic query tag: ${tag}`);
    }
  };
}

test('valida y normaliza el secreto temporal sin aceptar campos libres',() => {
  assert.equal(parseAuthoritativeProgramSectionCorrection(''),null);
  assert.equal(parseAuthoritativeProgramSectionCorrection(undefined),null);

  const parsed = correction({ seasonCode:'test-2026',reasonCode:'BOLETO-MOVIL-VERIFIED' });
  assert.equal(parsed.seasonCode,seasonCode);
  assert.equal(parsed.reasonCode,'boleto-movil-verified');
  assert.deepEqual(parsed.programs,programs);

  assertCorrectionError(
    () => parseAuthoritativeProgramSectionCorrection('{not-json'),
    'CONFIG_JSON_INVALID'
  );
  assertCorrectionError(
    () => parseAuthoritativeProgramSectionCorrection('[]'),
    'CONFIG_PAYLOAD_INVALID'
  );
  assertCorrectionError(() => correction({ unexpected:'not-allowed' }),'CONFIG_UNSUPPORTED_FIELD');
  assertCorrectionError(() => correction({ version:2 }),'CONFIG_VERSION_INVALID');
  assertCorrectionError(() => correction({ seasonCode:7 }),'CONFIG_FIELD_TYPE_INVALID');
  assertCorrectionError(() => correction({ seasonCode:'invalid season' }),'CONFIG_FIELD_FORMAT_INVALID');
  assertCorrectionError(() => correction({ expectedProgramCount:0 }),'CONFIG_PROGRAM_COUNT_INVALID');
  assertCorrectionError(
    () => correction({ expectedProgramCount:programs.length + 1 }),
    'CONFIG_PROGRAMS_INVALID'
  );
  assertCorrectionError(() => correction({ programs:{} }),'CONFIG_PROGRAMS_INVALID');
  assertCorrectionError(() => correction({ reasonCode:'free-form-reason' }),'CONFIG_REASON_INVALID');
});

test('rechaza programas ambiguos, duplicados o sin cambio efectivo declarado',() => {
  const malformed = [null,...programs.slice(1)];
  assertCorrectionError(() => correction({ programs:malformed }),'CONFIG_PROGRAMS_INVALID');

  const unsupported = programs.map((program,index) => index === 0
    ? { ...program,unexpected:'not-allowed' }
    : program);
  assertCorrectionError(() => correction({ programs:unsupported }),'CONFIG_UNSUPPORTED_FIELD');

  const invalidId = programs.map((program,index) => index === 0
    ? { ...program,programId:'not-a-uuid' }
    : program);
  assertCorrectionError(() => correction({ programs:invalidId }),'CONFIG_FIELD_FORMAT_INVALID');

  const unchanged = programs.map((program,index) => index === 0
    ? { ...program,toSection:program.fromSection }
    : program);
  assertCorrectionError(() => correction({ programs:unchanged }),'CONFIG_SECTION_UNCHANGED');

  const canonicallyUnchanged = programs.map((program,index) => index === 0
    ? { ...program,fromSection:'Sección 20-1',toSection:'seccion 201' }
    : program);
  assertCorrectionError(
    () => correction({ programs:canonicallyUnchanged }),
    'CONFIG_SECTION_UNCHANGED'
  );

  const invalidSegment = programs.map((program,index) => index === 0
    ? { ...program,expectedSegment:'SUITE' }
    : program);
  assertCorrectionError(() => correction({ programs:invalidSegment }),'CONFIG_SEGMENT_INVALID');

  const duplicateId = programs.map((program,index) => index === 1
    ? { ...program,programId:programs[0].programId }
    : program);
  assertCorrectionError(() => correction({ programs:duplicateId }),'CONFIG_PROGRAM_DUPLICATE');

  const duplicatePermanentKey = programs.map((program,index) => index === 1
    ? { ...program,permanentKey:programs[0].permanentKey }
    : program);
  assertCorrectionError(
    () => correction({ programs:duplicatePermanentKey }),
    'CONFIG_PROGRAM_DUPLICATE'
  );

  const duplicateSource = programs.map((program,index) => index === 1 ? {
    ...program,
    orderNumber:` ${programs[0].orderNumber.toLowerCase()} `,
    zone:programs[0].zone.toUpperCase(),
    fromSection:'source a',
    seat:'synthetic seat 1'
  } : program);
  assertCorrectionError(
    () => correction({ programs:duplicateSource }),
    'CONFIG_LOCATION_DUPLICATE'
  );

  const duplicateTarget = programs.map((program,index) => index === 1 ? {
    ...program,
    zone:'synthetic-private-zone',
    toSection:'target a',
    seat:'synthetic seat 1'
  } : program);
  assertCorrectionError(
    () => correction({ programs:duplicateTarget }),
    'CONFIG_LOCATION_DUPLICATE'
  );
});

test('deshabilitado no consulta PostgreSQL',async() => {
  const client = fakeClient();
  assert.deepEqual(
    await applyAuthoritativeProgramSectionCorrection(client,null),
    { status:'disabled',programCount:0 }
  );
  assert.equal(client.calls.length,0);
});

test('corrige solo la seccion de los UUID esperados, bloquea el padron y audita sin PII',async() => {
  const client = fakeClient();
  const result = await applyAuthoritativeProgramSectionCorrection(client,correction());

  assert.deepEqual(result,{ status:'applied',programCount:programs.length });
  assert.deepEqual(
    client.calls.map((call) => call.tag),
    [
      'lock','programs','orders','physical-conflicts','unique-conflicts',
      'alias-conflicts','update-programs','audit'
    ]
  );
  assert.match(client.calls.find((call) => call.tag === 'programs').sql,/FOR UPDATE/u);
  assert.match(client.calls.find((call) => call.tag === 'orders').sql,/FOR UPDATE/u);
  const uniqueConflictCheck = client.calls.find((call) => call.tag === 'unique-conflicts');
  assert.doesNotMatch(uniqueConflictCheck.sql,/p\.active|p\.eligibility_status/u);

  const update = client.calls.find((call) => call.tag === 'update-programs');
  assert.match(update.sql,/SET section=correction\.to_section,manual_lock=true,updated_at=now\(\)/u);
  assert.doesNotMatch(update.sql,/\b(?:INSERT|DELETE)\b/iu);
  const serialized = JSON.parse(update.params[1]);
  assert.deepEqual(
    serialized.map((entry) => entry.program_id),
    programs.map((program) => program.programId)
  );
  assert.deepEqual(
    serialized.map((entry) => entry.to_section),
    programs.map((program) => program.toSection)
  );
  assert.deepEqual(
    serialized.map((entry) => entry.expected_segment),
    programs.map((program) => program.expectedSegment)
  );
  assert.match(update.sql,/program\.segment=correction\.expected_segment/u);

  const audit = client.calls.find((call) => call.tag === 'audit');
  assert.deepEqual(audit.params,[
    programs.map((program) => program.programId),
    'boleto-movil-verified'
  ]);
  assert.match(audit.sql,/'field','section','reasonCode',\$2::text/u);
  for (const privateValue of [privateOrder,privateZone,privateSeat]) {
    assert.equal(audit.params.flat(Infinity).includes(privateValue),false);
    assert.equal(audit.sql.includes(privateValue),false);
  }

  const source = client.calls.map((call) => call.sql).join('\n');
  assert.doesNotMatch(source,/\b(?:UPDATE|DELETE|INSERT INTO)\s+rewards_attendance\b/iu);
  assert.doesNotMatch(source,/\b(?:UPDATE|DELETE|INSERT INTO)\s+rewards_deliveries\b/iu);
  assert.doesNotMatch(source,/INSERT INTO\s+rewards_program_aliases\b/iu);
});

test('un reinicio valida el destino completo y no vuelve a escribir',async() => {
  const client = fakeClient({ state:'target' });
  const result = await applyAuthoritativeProgramSectionCorrection(client,correction());

  assert.deepEqual(result,{ status:'already_applied',programCount:programs.length });
  assert.equal(client.calls.some((call) => call.tag === 'update-programs'),false);
  assert.equal(client.calls.some((call) => call.tag === 'audit'),false);
  assert.equal(client.calls.some((call) => call.tag === 'physical-conflicts'),true);
  assert.equal(client.calls.some((call) => call.tag === 'unique-conflicts'),true);
  assert.equal(client.calls.some((call) => call.tag === 'alias-conflicts'),true);
});

test('rechaza un destino sin bloqueo manual y estados parciales o inesperados',async() => {
  const incompleteRows = programs.map((program) => ({
    ...programRow(program,'target'),
    manual_lock:false
  }));
  await assert.rejects(
    applyAuthoritativeProgramSectionCorrection(
      fakeClient({ rows:incompleteRows }),correction()
    ),
    (error) => error instanceof AuthoritativeProgramSectionCorrectionError
      && error.code === 'TARGET_CORRECTION_INCOMPLETE'
  );
  await assert.rejects(
    applyAuthoritativeProgramSectionCorrection(fakeClient({ state:'mixed' }),correction()),
    (error) => error instanceof AuthoritativeProgramSectionCorrectionError
      && error.code === 'PROGRAM_STATE_MIXED'
  );
  await assert.rejects(
    applyAuthoritativeProgramSectionCorrection(fakeClient({ state:'unexpected' }),correction()),
    (error) => error instanceof AuthoritativeProgramSectionCorrectionError
      && error.code === 'PROGRAM_STATE_MISMATCH'
  );
});

test('requiere el conjunto exacto y la identidad estable de cada programa',async() => {
  await assert.rejects(
    applyAuthoritativeProgramSectionCorrection(
      fakeClient({ rowCount:programs.length - 1 }),correction()
    ),
    (error) => error instanceof AuthoritativeProgramSectionCorrectionError
      && error.code === 'PROGRAM_COUNT_MISMATCH'
  );

  for (const mutate of [
    (row) => ({ ...row,permanent_key:'00000000-0000-4000-8000-000000000299' }),
    (row) => ({ ...row,order_number:'OTHER-ORDER' }),
    (row) => ({ ...row,zone:'Other Zone' }),
    (row) => ({ ...row,seat:'Other Seat' }),
    (row) => ({ ...row,active:false }),
    (row) => ({ ...row,eligibility_status:'excluded' })
  ]) {
    const rows = programs.map((program,index) => index === 0
      ? mutate(programRow(program,'source',index))
      : programRow(program,'source',index));
    await assert.rejects(
      applyAuthoritativeProgramSectionCorrection(fakeClient({ rows }),correction()),
      (error) => error instanceof AuthoritativeProgramSectionCorrectionError
        && error.code === 'PROGRAM_IDENTITY_MISMATCH'
    );
  }
});

test('comprueba que cada programa conserve su orden normalizada y su segmento esperado',async() => {
  const withoutOrder = programs.map((program,index) => index === 0
    ? { ...programRow(program,'source',index),order_id:null }
    : programRow(program,'source',index));
  await assert.rejects(
    applyAuthoritativeProgramSectionCorrection(fakeClient({ rows:withoutOrder }),correction()),
    (error) => error instanceof AuthoritativeProgramSectionCorrectionError
      && error.code === 'PROGRAM_ORDER_MISMATCH'
  );

  for (const badOrders of [
    [{ id:orderIds[0],season_code:seasonCode,order_number:privateOrder }],
    programs.map((program,index) => ({
      id:orderIds[index],
      season_code:index === 0 ? 'OTHER-2026' : seasonCode,
      order_number:program.orderNumber
    })),
    programs.map((program,index) => ({
      id:orderIds[index],
      season_code:seasonCode,
      order_number:index === 0 ? 'OTHER-ORDER' : program.orderNumber
    }))
  ]) {
    await assert.rejects(
      applyAuthoritativeProgramSectionCorrection(
        fakeClient({ orders:badOrders }),correction()
      ),
      (error) => error instanceof AuthoritativeProgramSectionCorrectionError
        && error.code === 'PROGRAM_ORDER_MISMATCH'
    );
  }

  const wrongSegment = programs.map((program,index) => index === 0
    ? { ...programRow(program,'source',index),segment:'GENERAL' }
    : programRow(program,'source',index));
  await assert.rejects(
    applyAuthoritativeProgramSectionCorrection(fakeClient({ rows:wrongSegment }),correction()),
    (error) => error instanceof AuthoritativeProgramSectionCorrectionError
      && error.code === 'PROGRAM_IDENTITY_MISMATCH'
  );
});

test('impide colisiones fisicas o aliases antes de actualizar',async() => {
  for (const [option,expectedCode] of [
    ['physicalConflict','PHYSICAL_SEAT_CONFLICT'],
    ['uniqueConflict','TARGET_UNIQUE_KEY_CONFLICT'],
    ['aliasConflict','ALIAS_KEY_CONFLICT']
  ]) {
    const client = fakeClient({ [option]:true });
    await assert.rejects(
      applyAuthoritativeProgramSectionCorrection(client,correction()),
      (error) => error instanceof AuthoritativeProgramSectionCorrectionError
        && error.code === expectedCode
    );
    assert.equal(client.calls.some((call) => call.tag === 'update-programs'),false);
    assert.equal(client.calls.some((call) => call.tag === 'audit'),false);
  }
});

test('verifica tanto el conteo como los UUID devueltos por la actualizacion y la auditoria',async() => {
  await assert.rejects(
    applyAuthoritativeProgramSectionCorrection(
      fakeClient({ updateRowCount:programs.length - 1,updateIds:[programs[0].programId] }),
      correction()
    ),
    (error) => error instanceof AuthoritativeProgramSectionCorrectionError
      && error.code === 'PROGRAM_UPDATE_FAILED'
  );
  await assert.rejects(
    applyAuthoritativeProgramSectionCorrection(
      fakeClient({
        updateIds:[programs[0].programId,'00000000-0000-4000-8000-000000000299']
      }),
      correction()
    ),
    (error) => error instanceof AuthoritativeProgramSectionCorrectionError
      && error.code === 'PROGRAM_UPDATE_FAILED'
  );
  await assert.rejects(
    applyAuthoritativeProgramSectionCorrection(
      fakeClient({ auditRowCount:programs.length - 1 }),correction()
    ),
    (error) => error instanceof AuthoritativeProgramSectionCorrectionError
      && error.code === 'AUDIT_WRITE_FAILED'
  );
});

test('convierte fallos de PostgreSQL por etapa sin copiar datos privados',async() => {
  for (const [tag,expectedCode] of [
    ['lock','DB_LOCK_FAILED'],
    ['programs','DB_PROGRAMS_READ_FAILED'],
    ['orders','DB_ORDERS_READ_FAILED'],
    ['physical-conflicts','DB_PHYSICAL_CONFLICT_READ_FAILED'],
    ['unique-conflicts','DB_UNIQUE_CONFLICT_READ_FAILED'],
    ['alias-conflicts','DB_ALIAS_CONFLICT_READ_FAILED'],
    ['update-programs','DB_PROGRAM_UPDATE_FAILED'],
    ['audit','DB_AUDIT_WRITE_FAILED']
  ]) {
    await assert.rejects(
      applyAuthoritativeProgramSectionCorrection(fakeClient({ throwAt:tag }),correction()),
      (error) => (
        error instanceof AuthoritativeProgramSectionCorrectionError
        && error.code === expectedCode
        && !error.message.includes(privateOrder)
        && !error.message.includes(privateZone)
        && !error.message.includes(privateSeat)
      )
    );
  }
});

test('los diagnosticos son cerrados y nunca imprimen el secreto ni excepciones crudas',() => {
  const known = new AuthoritativeProgramSectionCorrectionError('PHYSICAL_SEAT_CONFLICT');
  assert.equal(
    safeProgramSectionCorrectionFailureLog(known),
    'Authoritative program section correction failed [PHYSICAL_SEAT_CONFLICT]; no correction was committed.'
  );
  const safe = safeProgramSectionCorrectionFailureLog(
    new Error(`${privateOrder} ${privateZone} ${privateSeat}`)
  );
  assert.equal(
    safe,
    'Authoritative program section correction failed [UNEXPECTED_ERROR]; no correction was committed.'
  );
  for (const privateValue of [privateOrder,privateZone,privateSeat]) {
    assert.equal(safe.includes(privateValue),false);
  }
  assert.equal(
    safeProgramSectionCorrectionFailureLog({ code:`PROGRAM_${privateOrder}` }),
    'Authoritative program section correction failed [UNEXPECTED_ERROR]; no correction was committed.'
  );
});
