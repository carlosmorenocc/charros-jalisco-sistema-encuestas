import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyConfirmedAttendanceCorrection,
  ConfirmedAttendanceCorrectionError,
  parseConfirmedAttendanceCorrection,
  safeConfirmedAttendanceFailureLog,
  safeConfirmedAttendanceSuccessLog
} from '../src/confirmed-attendance-correction.js';

const seasonCode = 'TEST-2026';
const orderNumber = 'SYNTHETIC-ORDER';
const programId = '00000000-0000-4000-8000-000000000601';
const holderId = '00000000-0000-4000-8000-000000000602';
const orderId = '00000000-0000-4000-8000-000000000603';
const gameId = '00000000-0000-4000-8000-000000000604';
const importId = '00000000-0000-4000-8000-000000000605';
const attendanceId = '00000000-0000-4000-8000-000000000606';
const importSha256 = 'a'.repeat(64);
const gamePlayedOn = '2026-10-20';
const gameDisplayName = 'Synthetic J1 vs Charros';
const scannedAt = '2026-10-20T18:30:00-06:00';
const zone = 'Synthetic Zone';
const section = 'SYNTHETIC-SECTION';
const seat = 'SYNTHETIC-SEAT';
const otherGameIds = Array.from({ length:10 },(_,index) => (
  `00000000-0000-4000-8001-${String(index + 1).padStart(12,'0')}`
));

function rawCorrection(overrides = {}) {
  return JSON.stringify({
    version:1,
    seasonCode,
    reasonCode:'staff-confirmed-unscanned-access',
    orderNumber,
    segment:'GENERAL',
    zone,
    section,
    seat,
    programId,
    gamePlayedOn,
    gameDisplayName,
    scannedAt,
    expectedVisitCountBefore:10,
    expectedVisitCountAfter:11,
    importSha256,
    ...overrides
  });
}

function correction(overrides) {
  return parseConfirmedAttendanceCorrection(rawCorrection(overrides));
}

function assertCorrectionError(action,expectedCode) {
  assert.throws(action,(error) => (
    error instanceof ConfirmedAttendanceCorrectionError
    && error.code === expectedCode
    && error.message === 'Confirmed attendance correction validation failed.'
  ));
}

function programRow(overrides = {}) {
  return {
    id:programId,
    season_code:seasonCode,
    order_number:orderNumber,
    holder_id:holderId,
    order_id:orderId,
    segment:'GENERAL',
    zone,
    section,
    seat,
    active:true,
    eligibility_status:'eligible',
    ...overrides
  };
}

function priorAttendanceRows() {
  return otherGameIds.map((currentGameId,index) => ({
    id:`00000000-0000-4000-8002-${String(index + 1).padStart(12,'0')}`,
    program_id:programId,
    game_id:currentGameId,
    first_import_id:`00000000-0000-4000-8003-${String(index + 1).padStart(12,'0')}`,
    scanned_at:`2026-09-${String(index + 1).padStart(2,'0')}T18:00:00-06:00`,
    barcode:`BARCODE-${index + 1}`
  }));
}

function correctedAttendanceRow(overrides = {}) {
  return {
    id:attendanceId,
    program_id:programId,
    game_id:gameId,
    first_import_id:importId,
    scanned_at:scannedAt,
    barcode:null,
    ...overrides
  };
}

function auditRow(overrides = {}) {
  return {
    id:'1',
    metadata:{
      reasonCode:'staff-confirmed-unscanned-access',
      gameId,
      importId,
      attendanceId,
      ...overrides
    }
  };
}

function fakeClient({
  program,
  order,
  game,
  sourceImport,
  attendance,
  auditRows = [],
  insertRowCount = 1,
  auditWriteRowCount = 1,
  postcondition,
  throwAt = null
} = {}) {
  const calls = [];
  const defaultOrder = {
    id:orderId,season_code:seasonCode,order_number:orderNumber,active:true
  };
  const defaultGame = {
    id:gameId,
    played_on:gamePlayedOn,
    display_name:gameDisplayName,
    report_status:'closed'
  };
  const defaultImport = {
    id:importId,
    kind:'access',
    sha256:importSha256,
    game_id:gameId,
    report_status:'closed'
  };
  return {
    calls,
    async query(sql,params = []) {
      const tag = sql.match(/confirmed-attendance:([a-z-]+)/u)?.[1];
      if (!tag) throw new Error('Missing synthetic query tag');
      calls.push({ tag,sql,params });
      if (tag === throwAt) throw new Error(`${orderNumber} ${zone} ${seat}`);
      if (tag === 'lock') return { rowCount:1,rows:[] };
      if (tag === 'program') {
        const row = program === undefined ? programRow() : program;
        return row ? { rowCount:1,rows:[row] } : { rowCount:0,rows:[] };
      }
      if (tag === 'order') {
        const row = order === undefined ? defaultOrder : order;
        return row ? { rowCount:1,rows:[row] } : { rowCount:0,rows:[] };
      }
      if (tag === 'game') {
        const row = game === undefined ? defaultGame : game;
        return row ? { rowCount:1,rows:[row] } : { rowCount:0,rows:[] };
      }
      if (tag === 'import') {
        const row = sourceImport === undefined ? defaultImport : sourceImport;
        return row ? { rowCount:1,rows:[row] } : { rowCount:0,rows:[] };
      }
      if (tag === 'attendance') {
        const rows = attendance ?? priorAttendanceRows();
        return { rowCount:rows.length,rows };
      }
      if (tag === 'audit-state') return { rowCount:auditRows.length,rows:auditRows };
      if (tag === 'insert') {
        return {
          rowCount:insertRowCount,
          rows:insertRowCount === 1 ? [{ id:attendanceId }] : []
        };
      }
      if (tag === 'audit-write') {
        return {
          rowCount:auditWriteRowCount,
          rows:auditWriteRowCount === 1 ? [{ id:'1' }] : []
        };
      }
      if (tag === 'postcondition') {
        const rows = postcondition ?? [...priorAttendanceRows(),correctedAttendanceRow()];
        return { rowCount:rows.length,rows };
      }
      throw new Error(`Unexpected synthetic query tag: ${tag}`);
    }
  };
}

test('valida y normaliza el secreto efímero con esquema cerrado',() => {
  assert.equal(parseConfirmedAttendanceCorrection(''),null);
  assert.equal(parseConfirmedAttendanceCorrection(undefined),null);
  const parsed = correction({ seasonCode:'test-2026',importSha256:'A'.repeat(64) });
  assert.equal(parsed.seasonCode,seasonCode);
  assert.equal(parsed.importSha256,importSha256);
  assert.equal(parsed.scannedAt,'2026-10-21T00:30:00.000Z');

  assertCorrectionError(
    () => parseConfirmedAttendanceCorrection('{bad-json'),
    'CONFIG_JSON_INVALID'
  );
  assertCorrectionError(
    () => parseConfirmedAttendanceCorrection('[]'),
    'CONFIG_PAYLOAD_INVALID'
  );
  assertCorrectionError(() => correction({ unexpected:'x' }),'CONFIG_UNSUPPORTED_FIELD');
  assertCorrectionError(() => correction({ version:2 }),'CONFIG_VERSION_INVALID');
  assertCorrectionError(() => correction({ segment:'SUITE' }),'CONFIG_SEGMENT_INVALID');
  assertCorrectionError(() => correction({ reasonCode:'free-form' }),'CONFIG_REASON_INVALID');
  assertCorrectionError(() => correction({ gamePlayedOn:'2026-02-31' }),'CONFIG_DATE_INVALID');
  assertCorrectionError(
    () => correction({ scannedAt:'2026-10-21T18:30:00-06:00' }),
    'CONFIG_TIMESTAMP_INVALID'
  );
  assertCorrectionError(
    () => correction({ expectedVisitCountBefore:10,expectedVisitCountAfter:12 }),
    'CONFIG_VISIT_COUNT_INVALID'
  );
  assertCorrectionError(() => correction({ programId:'bad-id' }),'CONFIG_FIELD_FORMAT_INVALID');
  assertCorrectionError(() => correction({ importSha256:'bad-hash' }),'CONFIG_FIELD_FORMAT_INVALID');
});

test('deshabilitado no consulta PostgreSQL',async() => {
  const client = fakeClient();
  assert.deepEqual(
    await applyConfirmedAttendanceCorrection(client,null),
    { status:'disabled',visitCount:0 }
  );
  assert.equal(client.calls.length,0);
});

test('agrega una sola visita confirmada, sin código de barras, y audita',async() => {
  const client = fakeClient();
  const result = await applyConfirmedAttendanceCorrection(client,correction());
  assert.deepEqual(result,{ status:'applied',visitCount:11 });
  assert.deepEqual(
    client.calls.map((call) => call.tag),
    [
      'lock','program','order','game','import','attendance','audit-state',
      'insert','audit-write','postcondition'
    ]
  );
  for (const tag of [
    'program','order','game','import','attendance','audit-state','postcondition'
  ]) {
    assert.match(client.calls.find((call) => call.tag === tag).sql,/FOR UPDATE/u);
  }
  const insert = client.calls.find((call) => call.tag === 'insert');
  assert.match(insert.sql,/VALUES\(\$1,\$2,\$3,\$4,NULL\)/u);
  assert.match(insert.sql,/ON CONFLICT\(program_id,game_id\) DO NOTHING/u);
  assert.deepEqual(insert.params,[
    programId,gameId,importId,'2026-10-21T00:30:00.000Z'
  ]);
  const audit = client.calls.find((call) => call.tag === 'audit-write');
  assert.match(audit.sql,/'attendance\.staff_verified_access'/u);
  assert.deepEqual(audit.params,[
    programId,'staff-confirmed-unscanned-access',gameId,importId,attendanceId
  ]);
});

test('un reinicio acepta solo la corrección exacta y no vuelve a escribir',async() => {
  const attendance = [...priorAttendanceRows(),correctedAttendanceRow()];
  const client = fakeClient({ attendance,auditRows:[auditRow()] });
  const result = await applyConfirmedAttendanceCorrection(client,correction());
  assert.deepEqual(result,{ status:'already_applied',visitCount:11 });
  assert.equal(client.calls.some((call) => call.tag === 'insert'),false);
  assert.equal(client.calls.some((call) => call.tag === 'audit-write'),false);
  assert.equal(client.calls.some((call) => call.tag === 'postcondition'),false);
});

test('exige programa, orden, juego e importación exactos',async() => {
  for (const badProgram of [
    null,
    programRow({ order_number:'OTHER' }),
    programRow({ segment:'VIP' }),
    programRow({ zone:'Other Zone' }),
    programRow({ section:'Other Section' }),
    programRow({ seat:'Other Seat' }),
    programRow({ active:false }),
    programRow({ eligibility_status:'excluded' }),
    programRow({ holder_id:null }),
    programRow({ order_id:null })
  ]) {
    await assert.rejects(
      applyConfirmedAttendanceCorrection(fakeClient({ program:badProgram }),correction()),
      (error) => error instanceof ConfirmedAttendanceCorrectionError
        && error.code === 'PROGRAM_STATE_MISMATCH'
    );
  }
  await assert.rejects(
    applyConfirmedAttendanceCorrection(
      fakeClient({
        order:{ id:orderId,season_code:seasonCode,order_number:orderNumber,active:false }
      }),
      correction()
    ),
    (error) => error instanceof ConfirmedAttendanceCorrectionError
      && error.code === 'ORDER_STATE_MISMATCH'
  );
  await assert.rejects(
    applyConfirmedAttendanceCorrection(
      fakeClient({ game:{
        id:gameId,
        played_on:gamePlayedOn,
        display_name:'Other Game',
        report_status:'closed'
      } }),
      correction()
    ),
    (error) => error instanceof ConfirmedAttendanceCorrectionError
      && error.code === 'GAME_STATE_MISMATCH'
  );
  await assert.rejects(
    applyConfirmedAttendanceCorrection(
      fakeClient({ sourceImport:{
        id:importId,
        kind:'access',
        sha256:importSha256,
        game_id:'00000000-0000-4000-8000-000000000699',
        report_status:'closed'
      } }),
      correction()
    ),
    (error) => error instanceof ConfirmedAttendanceCorrectionError
      && error.code === 'IMPORT_STATE_MISMATCH'
  );
});

test('rechaza conteos, visitas o auditorías incompatibles',async() => {
  await assert.rejects(
    applyConfirmedAttendanceCorrection(
      fakeClient({ attendance:priorAttendanceRows().slice(0,9) }),
      correction()
    ),
    (error) => error instanceof ConfirmedAttendanceCorrectionError
      && error.code === 'ATTENDANCE_COUNT_MISMATCH'
  );
  await assert.rejects(
    applyConfirmedAttendanceCorrection(
      fakeClient({ attendance:[...priorAttendanceRows().slice(0,9),correctedAttendanceRow()] }),
      correction()
    ),
    (error) => error instanceof ConfirmedAttendanceCorrectionError
      && error.code === 'TARGET_ATTENDANCE_CONFLICT'
  );
  await assert.rejects(
    applyConfirmedAttendanceCorrection(fakeClient({ auditRows:[auditRow()] }),correction()),
    (error) => error instanceof ConfirmedAttendanceCorrectionError
      && error.code === 'AUDIT_STATE_MISMATCH'
  );
  const applied = [...priorAttendanceRows(),correctedAttendanceRow({ barcode:'REAL-SCAN' })];
  await assert.rejects(
    applyConfirmedAttendanceCorrection(
      fakeClient({ attendance:applied,auditRows:[auditRow()] }),
      correction()
    ),
    (error) => error instanceof ConfirmedAttendanceCorrectionError
      && error.code === 'TARGET_ATTENDANCE_CONFLICT'
  );
});

test('protege inserción, auditoría y postcondición',async() => {
  await assert.rejects(
    applyConfirmedAttendanceCorrection(fakeClient({ insertRowCount:0 }),correction()),
    (error) => error instanceof ConfirmedAttendanceCorrectionError
      && error.code === 'ATTENDANCE_INSERT_FAILED'
  );
  await assert.rejects(
    applyConfirmedAttendanceCorrection(fakeClient({ auditWriteRowCount:0 }),correction()),
    (error) => error instanceof ConfirmedAttendanceCorrectionError
      && error.code === 'AUDIT_WRITE_FAILED'
  );
  await assert.rejects(
    applyConfirmedAttendanceCorrection(
      fakeClient({ postcondition:priorAttendanceRows() }),
      correction()
    ),
    (error) => error instanceof ConfirmedAttendanceCorrectionError
      && error.code === 'POSTCONDITION_MISMATCH'
  );
});

test('convierte fallos por etapa y nunca expone datos privados',async() => {
  for (const [tag,expectedCode] of [
    ['lock','DB_LOCK_FAILED'],
    ['program','DB_PROGRAM_READ_FAILED'],
    ['order','DB_ORDER_READ_FAILED'],
    ['game','DB_GAME_READ_FAILED'],
    ['import','DB_IMPORT_READ_FAILED'],
    ['attendance','DB_ATTENDANCE_READ_FAILED'],
    ['audit-state','DB_AUDIT_READ_FAILED'],
    ['insert','DB_ATTENDANCE_INSERT_FAILED'],
    ['audit-write','DB_AUDIT_WRITE_FAILED'],
    ['postcondition','DB_POSTCONDITION_READ_FAILED']
  ]) {
    await assert.rejects(
      applyConfirmedAttendanceCorrection(fakeClient({ throwAt:tag }),correction()),
      (error) => error instanceof ConfirmedAttendanceCorrectionError
        && error.code === expectedCode
        && !error.message.includes(orderNumber)
        && !error.message.includes(zone)
        && !error.message.includes(seat)
    );
  }
});

test('los logs seguros solo muestran estado o código cerrado',() => {
  assert.equal(
    safeConfirmedAttendanceSuccessLog('applied'),
    'Confirmed attendance correction completed [applied].'
  );
  assert.equal(
    safeConfirmedAttendanceSuccessLog('already_applied'),
    'Confirmed attendance correction completed [already_applied].'
  );
  const known = new ConfirmedAttendanceCorrectionError('ATTENDANCE_COUNT_MISMATCH');
  assert.equal(
    safeConfirmedAttendanceFailureLog(known),
    'Confirmed attendance correction failed [ATTENDANCE_COUNT_MISMATCH]; no correction was committed.'
  );
  const safe = safeConfirmedAttendanceFailureLog(new Error(`${orderNumber} ${zone} ${seat}`));
  assert.equal(
    safe,
    'Confirmed attendance correction failed [UNEXPECTED_ERROR]; no correction was committed.'
  );
  for (const privateValue of [orderNumber,zone,seat]) {
    assert.equal(safe.includes(privateValue),false);
  }
});
