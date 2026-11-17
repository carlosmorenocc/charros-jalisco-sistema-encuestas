import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAttendanceCorrection,
  AttendanceCorrectionError,
  parseAttendanceCorrection,
  safeAttendanceCorrectionFailureLog,
  safeAttendanceCorrectionSuccessLog
} from '../src/attendance-correction.js';

const seasonCode = 'TEST-2026';
const privateOrder = 'SYNTHETIC-PRIVATE-ORDER';
const privateZone = 'Synthetic Private Zone';
const privateSection = 'PRIVATE-SECTION';
const privateSourceSeat = 'PRIVATE-SOURCE-SEAT';
const privateTargetSeat = 'PRIVATE-TARGET-SEAT';
const sourceProgramId = '00000000-0000-4000-8000-000000000401';
const targetProgramId = '00000000-0000-4000-8000-000000000402';
const sourceHolderId = '00000000-0000-4000-8000-000000000419';
const targetHolderId = '00000000-0000-4000-8000-000000000420';
const orderId = '00000000-0000-4000-8000-000000000421';
const sourceImportId = '00000000-0000-4000-8000-000000000430';
const insertedAttendanceId = '00000000-0000-4000-8000-000000000431';
const gameIds = Array.from({ length:9 },(_,index) => (
  `00000000-0000-4000-8000-${String(500 + index).padStart(12,'0')}`
));
const gameId = gameIds.at(-1);
const gamePlayedOn = '2026-11-12';
const expectedSourceScannedAt = '2026-11-12T19:15:00-06:00';

function rawCorrection(overrides = {}) {
  return JSON.stringify({
    version:1,
    seasonCode,
    reasonCode:'verified-missed-scan',
    orderNumber:privateOrder,
    segment:'GENERAL',
    zone:privateZone,
    section:privateSection,
    gamePlayedOn,
    expectedSourceScannedAt,
    expectedSourceVisitCount:9,
    expectedTargetVisitCount:8,
    source:{
      programId:sourceProgramId,
      seat:privateSourceSeat
    },
    target:{
      programId:targetProgramId,
      seat:privateTargetSeat
    },
    ...overrides
  });
}

function correction(overrides) {
  return parseAttendanceCorrection(rawCorrection(overrides));
}

function assertCorrectionError(action,expectedCode) {
  assert.throws(action,(error) => (
    error instanceof AttendanceCorrectionError
    && error.code === expectedCode
    && error.message === 'Attendance correction validation failed.'
  ));
}

function programRow(id,seat,holderId,overrides = {}) {
  return {
    id,
    season_code:seasonCode,
    order_number:privateOrder,
    holder_id:holderId,
    order_id:orderId,
    segment:'GENERAL',
    zone:privateZone,
    section:privateSection,
    seat,
    active:true,
    eligibility_status:'eligible',
    ...overrides
  };
}

function attendanceRow(programId,currentGameId,index,{ manual = false } = {}) {
  const isCorrectionGame = currentGameId === gameId;
  return {
    id:`00000000-0000-4000-8001-${String(index).padStart(12,'0')}`,
    program_id:programId,
    game_id:currentGameId,
    first_import_id:isCorrectionGame
      ? sourceImportId
      : `00000000-0000-4000-8002-${String(index).padStart(12,'0')}`,
    scanned_at:isCorrectionGame
      ? expectedSourceScannedAt
      : `2026-10-${String(13 + index).padStart(2,'0')}T19:00:00-06:00`,
    barcode:manual ? null : `BARCODE-${index}`
  };
}

function sourceAttendance() {
  return gameIds.map((currentGameId,index) => (
    attendanceRow(sourceProgramId,currentGameId,index + 1)
  ));
}

function targetAttendance({ applied = false } = {}) {
  const ids = applied ? gameIds : gameIds.slice(0,-1);
  return ids.map((currentGameId,index) => attendanceRow(
    targetProgramId,
    currentGameId,
    index + 101,
    { manual:applied && currentGameId === gameId }
  ));
}

function fakeClient({
  programs,
  order,
  game,
  attendance,
  sourceImport,
  auditRows = [],
  insertRowCount = 1,
  auditWriteRowCount = 1,
  postconditionAttendance,
  throwAt = null
} = {}) {
  const calls = [];
  const defaultPrograms = [
    programRow(sourceProgramId,privateSourceSeat,sourceHolderId),
    programRow(targetProgramId,privateTargetSeat,targetHolderId)
  ];
  const defaultOrder = {
    id:orderId,season_code:seasonCode,order_number:privateOrder,active:true
  };
  const defaultGame = { id:gameId,played_on:gamePlayedOn,report_status:'closed' };
  const defaultSourceImport = { id:sourceImportId,kind:'access',game_id:gameId };
  return {
    calls,
    async query(sql,params = []) {
      const tag = sql.match(/attendance-correction:([a-z-]+)/u)?.[1];
      if (!tag) throw new Error('Missing synthetic query tag');
      calls.push({ tag,sql,params });
      if (tag === throwAt) {
        throw new Error(`${privateOrder} ${privateZone} ${privateSourceSeat}`);
      }
      if (tag === 'lock') return { rowCount:1,rows:[] };
      if (tag === 'programs') {
        const rows = programs ?? defaultPrograms;
        return { rowCount:rows.length,rows };
      }
      if (tag === 'order') {
        const row = order === undefined ? defaultOrder : order;
        return row ? { rowCount:1,rows:[row] } : { rowCount:0,rows:[] };
      }
      if (tag === 'game') {
        const row = game === undefined ? defaultGame : game;
        return row ? { rowCount:1,rows:[row] } : { rowCount:0,rows:[] };
      }
      if (tag === 'attendance') {
        const rows = attendance ?? [...sourceAttendance(),...targetAttendance()];
        return { rowCount:rows.length,rows };
      }
      if (tag === 'source-import') {
        const row = sourceImport === undefined ? defaultSourceImport : sourceImport;
        return row ? { rowCount:1,rows:[row] } : { rowCount:0,rows:[] };
      }
      if (tag === 'audit-state') return { rowCount:auditRows.length,rows:auditRows };
      if (tag === 'insert-attendance') {
        return {
          rowCount:insertRowCount,
          rows:insertRowCount === 1 ? [{ id:insertedAttendanceId }] : []
        };
      }
      if (tag === 'audit-write') {
        return {
          rowCount:auditWriteRowCount,
          rows:auditWriteRowCount === 1 ? [{ id:'1' }] : []
        };
      }
      if (tag === 'postcondition') {
        const rows = postconditionAttendance
          ?? [...sourceAttendance(),...targetAttendance({ applied:true })];
        return { rowCount:rows.length,rows };
      }
      throw new Error(`Unexpected synthetic query tag: ${tag}`);
    }
  };
}

test('valida y normaliza el secreto efímero con esquema cerrado',() => {
  assert.equal(parseAttendanceCorrection(''),null);
  assert.equal(parseAttendanceCorrection(undefined),null);
  const parsed = correction({ seasonCode:'test-2026',reasonCode:'VERIFIED-MISSED-SCAN' });
  assert.equal(parsed.seasonCode,seasonCode);
  assert.equal(parsed.reasonCode,'verified-missed-scan');
  assert.equal(parsed.expectedSourceScannedAt,'2026-11-13T01:15:00.000Z');

  assertCorrectionError(() => parseAttendanceCorrection('{bad-json'),'CONFIG_JSON_INVALID');
  assertCorrectionError(() => parseAttendanceCorrection('[]'),'CONFIG_PAYLOAD_INVALID');
  assertCorrectionError(() => correction({ unexpected:'not-allowed' }),'CONFIG_UNSUPPORTED_FIELD');
  assertCorrectionError(() => correction({ version:2 }),'CONFIG_VERSION_INVALID');
  assertCorrectionError(() => correction({ seasonCode:7 }),'CONFIG_FIELD_TYPE_INVALID');
  assertCorrectionError(() => correction({ seasonCode:'invalid season' }),'CONFIG_FIELD_FORMAT_INVALID');
  assertCorrectionError(() => correction({ segment:'SUITE' }),'CONFIG_SEGMENT_INVALID');
  assertCorrectionError(() => correction({ reasonCode:'free-form' }),'CONFIG_REASON_INVALID');
  assertCorrectionError(() => correction({ gamePlayedOn:'2026-02-31' }),'CONFIG_DATE_INVALID');
  assertCorrectionError(
    () => correction({ expectedSourceScannedAt:'2026-11-11T19:15:00-06:00' }),
    'CONFIG_TIMESTAMP_INVALID'
  );
  assertCorrectionError(
    () => correction({ expectedSourceVisitCount:9,expectedTargetVisitCount:7 }),
    'CONFIG_VISIT_COUNT_INVALID'
  );
});

test('rechaza identidades de programa incompletas o duplicadas',() => {
  assertCorrectionError(() => correction({ source:null }),'CONFIG_PROGRAM_INVALID');
  assertCorrectionError(
    () => correction({ source:{ ...JSON.parse(rawCorrection()).source,unexpected:'x' } }),
    'CONFIG_UNSUPPORTED_FIELD'
  );
  assertCorrectionError(
    () => correction({ source:{ ...JSON.parse(rawCorrection()).source,programId:'bad-id' } }),
    'CONFIG_FIELD_FORMAT_INVALID'
  );
  const base = JSON.parse(rawCorrection());
  assertCorrectionError(
    () => correction({
      source:{
        ...base.source,
        permanentKey:'00000000-0000-4000-8000-000000000411'
      }
    }),
    'CONFIG_UNSUPPORTED_FIELD'
  );
  assertCorrectionError(
    () => correction({ target:{ ...base.target,programId:base.source.programId } }),
    'CONFIG_PROGRAM_DUPLICATE'
  );
  assertCorrectionError(
    () => correction({ target:{ ...base.target,seat:'private source seat' } }),
    'CONFIG_PROGRAM_DUPLICATE'
  );
});

test('deshabilitado no consulta PostgreSQL',async() => {
  const client = fakeClient();
  assert.deepEqual(
    await applyAttendanceCorrection(client,null),
    { status:'disabled',sourceVisitCount:0,targetVisitCount:0 }
  );
  assert.equal(client.calls.length,0);
});

test('copia una sola visita, conserva hora e importación y audita sin PII',async() => {
  const client = fakeClient();
  const result = await applyAttendanceCorrection(client,correction());
  assert.deepEqual(result,{ status:'applied',sourceVisitCount:9,targetVisitCount:9 });
  assert.deepEqual(
    client.calls.map((call) => call.tag),
    [
      'lock','programs','order','game','attendance','source-import',
      'audit-state','insert-attendance','audit-write','postcondition'
    ]
  );
  for (const tag of [
    'programs','order','game','attendance','source-import','audit-state','postcondition'
  ]) {
    assert.match(client.calls.find((call) => call.tag === tag).sql,/FOR UPDATE/u);
  }

  const insert = client.calls.find((call) => call.tag === 'insert-attendance');
  assert.match(insert.sql,/VALUES\(\$1,\$2,\$3,\$4,NULL\)/u);
  assert.match(insert.sql,/ON CONFLICT\(program_id,game_id\) DO NOTHING/u);
  assert.deepEqual(insert.params,[
    targetProgramId,gameId,sourceImportId,expectedSourceScannedAt
  ]);

  const audit = client.calls.find((call) => call.tag === 'audit-write');
  assert.match(audit.sql,/'attendance\.verified_missing_scan'/u);
  assert.deepEqual(audit.params,[
    targetProgramId,'verified-missed-scan',sourceProgramId,gameId,insertedAttendanceId
  ]);
  for (const privateValue of [
    privateOrder,privateZone,privateSection,privateSourceSeat,privateTargetSeat
  ]) {
    assert.equal(audit.sql.includes(privateValue),false);
    assert.equal(audit.params.flat(Infinity).includes(privateValue),false);
  }
});

test('un reinicio acepta únicamente la corrección exacta y no vuelve a escribir',async() => {
  const attendance = [...sourceAttendance(),...targetAttendance({ applied:true })];
  const auditRows = [{
    id:'1',
    metadata:{
      reasonCode:'verified-missed-scan',
      sourceProgramId,
      gameId,
      attendanceId:insertedAttendanceId
    }
  }];
  const client = fakeClient({ attendance,auditRows });
  const result = await applyAttendanceCorrection(client,correction());
  assert.deepEqual(
    result,
    { status:'already_applied',sourceVisitCount:9,targetVisitCount:9 }
  );
  assert.equal(client.calls.some((call) => call.tag === 'insert-attendance'),false);
  assert.equal(client.calls.some((call) => call.tag === 'audit-write'),false);
});

test('exige identidad estable, titulares presentes y exactamente la misma orden',async() => {
  const source = programRow(sourceProgramId,privateSourceSeat,sourceHolderId);
  const target = programRow(targetProgramId,privateTargetSeat,targetHolderId);
  for (const mutate of [
    (row) => ({ ...row,order_number:'OTHER-ORDER' }),
    (row) => ({ ...row,segment:'VIP' }),
    (row) => ({ ...row,zone:'Other Zone' }),
    (row) => ({ ...row,section:'Other Section' }),
    (row) => ({ ...row,seat:'Other Seat' }),
    (row) => ({ ...row,active:false }),
    (row) => ({ ...row,eligibility_status:'excluded' })
  ]) {
    await assert.rejects(
      applyAttendanceCorrection(
        fakeClient({ programs:[mutate(source),target] }),correction()
      ),
      (error) => error instanceof AttendanceCorrectionError
        && error.code === 'PROGRAM_IDENTITY_MISMATCH'
    );
  }

  for (const relationChange of [
    { holder_id:null },
    { order_id:null },
    { order_id:'00000000-0000-4000-8000-000000000499' }
  ]) {
    await assert.rejects(
      applyAttendanceCorrection(
        fakeClient({ programs:[source,{ ...target,...relationChange }] }),correction()
      ),
      (error) => error instanceof AttendanceCorrectionError
        && error.code === 'PROGRAM_RELATION_MISMATCH'
    );
  }
});

test('rechaza orden o partido distintos del estado esperado',async() => {
  for (const badOrder of [
    null,
    { id:orderId,season_code:'OTHER-2026',order_number:privateOrder,active:true },
    { id:orderId,season_code:seasonCode,order_number:'OTHER-ORDER',active:true },
    { id:orderId,season_code:seasonCode,order_number:privateOrder,active:false }
  ]) {
    await assert.rejects(
      applyAttendanceCorrection(fakeClient({ order:badOrder }),correction()),
      (error) => error instanceof AttendanceCorrectionError
        && error.code === 'ORDER_STATE_MISMATCH'
    );
  }
  for (const badGame of [
    null,
    { id:gameId,played_on:'2026-11-11',report_status:'closed' },
    { id:gameId,played_on:gamePlayedOn,report_status:'scheduled' }
  ]) {
    await assert.rejects(
      applyAttendanceCorrection(fakeClient({ game:badGame }),correction()),
      (error) => error instanceof AttendanceCorrectionError
        && error.code === 'GAME_STATE_MISMATCH'
    );
  }
});

test('requiere conteos 9/8 y una diferencia de exactamente el juego declarado',async() => {
  const source = sourceAttendance();
  const target = targetAttendance();
  await assert.rejects(
    applyAttendanceCorrection(
      fakeClient({ attendance:[...source.slice(0,-1),...target] }),correction()
    ),
    (error) => error instanceof AttendanceCorrectionError
      && error.code === 'ATTENDANCE_COUNT_MISMATCH'
  );
  await assert.rejects(
    applyAttendanceCorrection(
      fakeClient({ attendance:[...source,...target.slice(0,-1)] }),correction()
    ),
    (error) => error instanceof AttendanceCorrectionError
      && error.code === 'ATTENDANCE_COUNT_MISMATCH'
  );

  const wrongTarget = target.map((row,index) => index === 0
    ? { ...row,game_id:'00000000-0000-4000-8000-000000000599' }
    : row);
  await assert.rejects(
    applyAttendanceCorrection(
      fakeClient({ attendance:[...source,...wrongTarget] }),correction()
    ),
    (error) => error instanceof AttendanceCorrectionError
      && error.code === 'ATTENDANCE_SET_MISMATCH'
  );
});

test('rechaza hora fuente incorrecta y una asistencia destino conflictiva',async() => {
  const wrongSource = sourceAttendance().map((row) => row.game_id === gameId
    ? { ...row,scanned_at:'2026-11-12T20:00:00-06:00' }
    : row);
  await assert.rejects(
    applyAttendanceCorrection(
      fakeClient({ attendance:[...wrongSource,...targetAttendance()] }),correction()
    ),
    (error) => error instanceof AttendanceCorrectionError
      && error.code === 'SOURCE_ATTENDANCE_MISMATCH'
  );

  const conflictingTarget = targetAttendance({ applied:true }).map((row) => (
    row.game_id === gameId ? { ...row,barcode:'ACTUAL-SCAN' } : row
  ));
  await assert.rejects(
    applyAttendanceCorrection(
      fakeClient({ attendance:[...sourceAttendance(),...conflictingTarget] }),correction()
    ),
    (error) => error instanceof AttendanceCorrectionError
      && error.code === 'TARGET_ATTENDANCE_CONFLICT'
  );
});

test('comprueba importación fuente, auditoría e inserciones de forma idempotente',async() => {
  await assert.rejects(
    applyAttendanceCorrection(
      fakeClient({ sourceImport:{ id:sourceImportId,kind:'sales',game_id:gameId } }),
      correction()
    ),
    (error) => error instanceof AttendanceCorrectionError
      && error.code === 'SOURCE_IMPORT_MISMATCH'
  );
  await assert.rejects(
    applyAttendanceCorrection(fakeClient({ auditRows:[{ id:'1',metadata:{} }] }),correction()),
    (error) => error instanceof AttendanceCorrectionError
      && error.code === 'AUDIT_STATE_MISMATCH'
  );
  await assert.rejects(
    applyAttendanceCorrection(fakeClient({ insertRowCount:0 }),correction()),
    (error) => error instanceof AttendanceCorrectionError
      && error.code === 'ATTENDANCE_INSERT_FAILED'
  );
  await assert.rejects(
    applyAttendanceCorrection(fakeClient({ auditWriteRowCount:0 }),correction()),
    (error) => error instanceof AttendanceCorrectionError
      && error.code === 'AUDIT_WRITE_FAILED'
  );
  await assert.rejects(
    applyAttendanceCorrection(
      fakeClient({
        postconditionAttendance:[...sourceAttendance(),...targetAttendance()]
      }),
      correction()
    ),
    (error) => error instanceof AttendanceCorrectionError
      && error.code === 'POSTCONDITION_MISMATCH'
  );

  const appliedAttendance = [...sourceAttendance(),...targetAttendance({ applied:true })];
  await assert.rejects(
    applyAttendanceCorrection(
      fakeClient({ attendance:appliedAttendance,auditRows:[] }),correction()
    ),
    (error) => error instanceof AttendanceCorrectionError
      && error.code === 'AUDIT_STATE_MISMATCH'
  );
});

test('convierte fallos PostgreSQL por etapa y nunca expone valores privados',async() => {
  for (const [tag,expectedCode] of [
    ['lock','DB_LOCK_FAILED'],
    ['programs','DB_PROGRAMS_READ_FAILED'],
    ['order','DB_ORDER_READ_FAILED'],
    ['game','DB_GAME_READ_FAILED'],
    ['attendance','DB_ATTENDANCE_READ_FAILED'],
    ['source-import','DB_SOURCE_IMPORT_READ_FAILED'],
    ['audit-state','DB_AUDIT_READ_FAILED'],
    ['insert-attendance','DB_ATTENDANCE_INSERT_FAILED'],
    ['audit-write','DB_AUDIT_WRITE_FAILED'],
    ['postcondition','DB_POSTCONDITION_READ_FAILED']
  ]) {
    await assert.rejects(
      applyAttendanceCorrection(fakeClient({ throwAt:tag }),correction()),
      (error) => error instanceof AttendanceCorrectionError
        && error.code === expectedCode
        && !error.message.includes(privateOrder)
        && !error.message.includes(privateZone)
        && !error.message.includes(privateSourceSeat)
    );
  }
});

test('los mensajes de fallo son cerrados y no imprimen PII ni el secreto',() => {
  const known = new AttendanceCorrectionError('ATTENDANCE_SET_MISMATCH');
  assert.equal(
    safeAttendanceCorrectionFailureLog(known),
    'Attendance correction failed [ATTENDANCE_SET_MISMATCH]; no correction was committed.'
  );
  const safe = safeAttendanceCorrectionFailureLog(
    new Error(`${privateOrder} ${privateZone} ${privateSourceSeat}`)
  );
  assert.equal(
    safe,
    'Attendance correction failed [UNEXPECTED_ERROR]; no correction was committed.'
  );
  for (const privateValue of [privateOrder,privateZone,privateSourceSeat]) {
    assert.equal(safe.includes(privateValue),false);
  }
  assert.equal(
    safeAttendanceCorrectionFailureLog({ code:`PROGRAM_${privateOrder}` }),
    'Attendance correction failed [UNEXPECTED_ERROR]; no correction was committed.'
  );
});

test('los mensajes de éxito exponen solo el estado idempotente permitido',() => {
  assert.equal(
    safeAttendanceCorrectionSuccessLog('applied'),
    'Attendance correction completed [applied].'
  );
  assert.equal(
    safeAttendanceCorrectionSuccessLog('already_applied'),
    'Attendance correction completed [already_applied].'
  );
  assert.throws(
    () => safeAttendanceCorrectionSuccessLog(privateOrder),
    /Unexpected attendance correction status/u
  );
});
