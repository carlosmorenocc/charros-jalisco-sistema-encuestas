import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyProgramEnrollment,
  enrollmentHolderIdentityKey,
  parseProgramEnrollment,
  ProgramEnrollmentError,
  safeEnrollmentFailureLog
} from '../src/program-enrollment.js';

const holderId = '00000000-0000-4000-8000-000000000101';
const orderId = '00000000-0000-4000-8000-000000000102';
const programId = '00000000-0000-4000-8000-000000000103';
const importOneId = '00000000-0000-4000-8000-000000000111';
const importTwoId = '00000000-0000-4000-8000-000000000112';
const gameOneId = '00000000-0000-4000-8000-000000000121';
const gameTwoId = '00000000-0000-4000-8000-000000000122';
const privateName = 'Synthetic Courtesy Holder';
const privateOrder = 'SYNTHETIC-ORDER-001';
const privateEvent = 'Synthetic exceptional subscription';
const privateBarcode = 'synthetic-barcode';

const rawEnrollment = (overrides = {}) => JSON.stringify({
  version:1,
  seasonCode:'TEST-2026',
  reasonCode:'authorized_giveaway_courtesy',
  holder:{
    displayName:privateName,
    email:null,
    phone:null
  },
  order:{
    orderNumber:privateOrder,
    purchaseCode:null,
    sourceEvent:privateEvent,
    seller:null,
    discountLabel:null,
    purchasedAt:null,
    paymentType:null
  },
  program:{
    segment:'GENERAL',
    zone:'Synthetic Zone',
    section:'S-1',
    seat:'A-1',
    barcode:null,
    sourceReference:'synthetic-private-source'
  },
  historicalAttendance:[
    {
      gamePlayedOn:'2026-10-13',
      importSha256:'a'.repeat(64),
      scannedAt:'2026-10-13T17:00:00-06:00',
      barcode:`${privateBarcode}-1`
    },
    {
      gamePlayedOn:'2026-10-20',
      importSha256:'b'.repeat(64),
      scannedAt:'2026-10-20T18:00:00-06:00',
      barcode:`${privateBarcode}-2`
    }
  ],
  ...overrides
});

const enrollment = (overrides) => parseProgramEnrollment(rawEnrollment(overrides));

function assertEnrollmentError(action,expectedCode) {
  assert.throws(action,(error) => (
    error instanceof ProgramEnrollmentError
    && error.code === expectedCode
    && error.message === 'Exceptional program enrollment validation failed.'
  ));
}

function holderRow(config) {
  return {
    id:holderId,
    identity_key:enrollmentHolderIdentityKey(config.holder),
    display_name:config.holder.displayName,
    email:config.holder.email,
    phone:config.holder.phone,
    active:true
  };
}

function orderRow(config) {
  return {
    id:orderId,
    season_code:config.seasonCode,
    order_number:config.order.orderNumber,
    purchase_code:config.order.purchaseCode,
    buyer_holder_id:holderId,
    seller:config.order.seller,
    discount_label:config.order.discountLabel,
    purchased_at:config.order.purchasedAt,
    payment_type:config.order.paymentType,
    source_event:config.order.sourceEvent,
    active:true
  };
}

function programRow(config) {
  return {
    id:programId,
    season_code:config.seasonCode,
    order_number:config.order.orderNumber,
    purchase_code:config.order.purchaseCode,
    holder_name:config.holder.displayName,
    holder_email:config.holder.email,
    holder_phone:config.holder.phone,
    zone:config.program.zone,
    section:config.program.section,
    seat:config.program.seat,
    barcode:config.program.barcode,
    source_event:config.order.sourceEvent,
    segment:config.program.segment,
    eligibility_status:'eligible',
    eligibility_exception:config.reasonCode,
    manual_lock:true,
    active:true,
    holder_id:holderId,
    order_id:orderId,
    source_reference:config.program.sourceReference
  };
}

function historyReference(sha256) {
  return sha256 === 'a'.repeat(64)
    ? { import_id:importOneId,game_id:gameOneId,played_on:'2026-10-13' }
    : { import_id:importTwoId,game_id:gameTwoId,played_on:'2026-10-20' };
}

function fakeClient({
  alreadyApplied = false,
  existingHolder = alreadyApplied,
  physicalConflict = false,
  aliasConflict = false,
  missingHistoryImport = false,
  attendanceConflict = false,
  throwAt = null
} = {}) {
  const config = enrollment();
  const calls = [];
  return {
    calls,
    async query(sql,params = []) {
      const tag = sql.match(/program-enrollment:([a-z-]+)/u)?.[1];
      if (!tag) throw new Error('Missing synthetic query tag');
      calls.push({ tag,params,sql });
      if (tag === throwAt) throw new Error(`${privateName} ${privateOrder} ${privateBarcode}`);
      if (tag === 'lock') return { rowCount:1,rows:[] };
      if (tag === 'season') return { rowCount:1,rows:[{ code:config.seasonCode,active:true }] };
      if (tag === 'holder') {
        return existingHolder
          ? { rowCount:1,rows:[holderRow(config)] }
          : { rowCount:0,rows:[] };
      }
      if (tag === 'order') {
        return alreadyApplied
          ? { rowCount:1,rows:[orderRow(config)] }
          : { rowCount:0,rows:[] };
      }
      if (tag === 'program') {
        return alreadyApplied
          ? { rowCount:1,rows:[programRow(config)] }
          : { rowCount:0,rows:[] };
      }
      if (tag === 'physical-seat') {
        if (alreadyApplied) return { rowCount:1,rows:[{ id:programId }] };
        if (physicalConflict) {
          return { rowCount:1,rows:[{ id:'00000000-0000-4000-8000-000000000199' }] };
        }
        return { rowCount:0,rows:[] };
      }
      if (tag === 'alias') {
        return aliasConflict
          ? { rowCount:1,rows:[{ id:'alias-1',program_id:'other-program' }] }
          : { rowCount:0,rows:[] };
      }
      if (tag === 'history-import') {
        if (missingHistoryImport) return { rowCount:0,rows:[] };
        return { rowCount:1,rows:[historyReference(params[0])] };
      }
      if (tag === 'insert-holder') return { rowCount:1,rows:[holderRow(config)] };
      if (tag === 'insert-order') return { rowCount:1,rows:[orderRow(config)] };
      if (tag === 'insert-program') return { rowCount:1,rows:[programRow(config)] };
      if (tag === 'insert-attendance') return { rowCount:1,rows:[{ id:'attendance-id' }] };
      if (tag === 'attendance') {
        const rows = [
          {
            program_id:programId,
            game_id:gameOneId,
            first_import_id:attendanceConflict ? importTwoId : importOneId,
            scanned_at:'2026-10-13T23:00:00.000Z',
            barcode:`${privateBarcode}-1`
          },
          {
            program_id:programId,
            game_id:gameTwoId,
            first_import_id:importTwoId,
            scanned_at:'2026-10-21T00:00:00.000Z',
            barcode:`${privateBarcode}-2`
          }
        ];
        return { rowCount:rows.length,rows };
      }
      if (tag === 'audit') return { rowCount:1,rows:[] };
      throw new Error(`Unexpected synthetic query tag: ${tag}`);
    }
  };
}

test('valida el secreto privado, admite contactos nulos y usa un motivo cerrado',() => {
  assert.equal(parseProgramEnrollment(''),null);
  const parsed = enrollment();
  assert.equal(parsed.holder.email,null);
  assert.equal(parsed.holder.phone,null);
  assert.equal(parsed.reasonCode,'authorized_giveaway_courtesy');
  assert.equal(parsed.historicalAttendance.length,2);

  assertEnrollmentError(
    () => parseProgramEnrollment(rawEnrollment({ unexpected:'not-allowed' })),
    'CONFIG_UNSUPPORTED_FIELD'
  );
  assertEnrollmentError(
    () => parseProgramEnrollment(rawEnrollment({ reasonCode:'free-form-reason' })),
    'CONFIG_REASON_INVALID'
  );
  const withoutSourceReference = JSON.parse(rawEnrollment());
  delete withoutSourceReference.program.sourceReference;
  assertEnrollmentError(
    () => parseProgramEnrollment(JSON.stringify(withoutSourceReference)),
    'CONFIG_FIELD_FORMAT_INVALID'
  );
  assertEnrollmentError(
    () => parseProgramEnrollment(rawEnrollment({
      historicalAttendance:[
        {
          gamePlayedOn:'2026-10-13',importSha256:'a'.repeat(64),
          scannedAt:'2026-10-14T00:00:00Z',barcode:null
        }
      ]
    })),
    'CONFIG_ATTENDANCE_INVALID'
  );
  const duplicate = JSON.parse(rawEnrollment()).historicalAttendance;
  duplicate[1].gamePlayedOn = duplicate[0].gamePlayedOn;
  duplicate[1].scannedAt = duplicate[0].scannedAt;
  assertEnrollmentError(
    () => parseProgramEnrollment(rawEnrollment({ historicalAttendance:duplicate })),
    'CONFIG_ATTENDANCE_DUPLICATE'
  );
});

test('los diagnósticos nunca copian datos privados ni errores de PostgreSQL',async() => {
  const known = new ProgramEnrollmentError('PHYSICAL_SEAT_CONFLICT');
  assert.equal(
    safeEnrollmentFailureLog(known),
    'Exceptional program enrollment failed [PHYSICAL_SEAT_CONFLICT]; no enrollment was committed.'
  );
  const unexpected = new Error(`${privateName} ${privateOrder} ${privateBarcode}`);
  const safe = safeEnrollmentFailureLog(unexpected);
  assert.equal(
    safe,
    'Exceptional program enrollment failed [UNEXPECTED_ERROR]; no enrollment was committed.'
  );
  for (const value of [privateName,privateOrder,privateBarcode]) {
    assert.equal(safe.includes(value),false);
  }

  await assert.rejects(
    applyProgramEnrollment(fakeClient({ throwAt:'program' }),enrollment()),
    (error) => (
      error instanceof ProgramEnrollmentError
      && error.code === 'DB_PROGRAM_READ_FAILED'
      && !error.message.includes(privateName)
      && !error.message.includes(privateOrder)
      && !error.message.includes(privateBarcode)
    )
  );
});

test('crea titular, orden y programa bloqueado y recupera historial con trazabilidad mínima',async() => {
  const client = fakeClient();
  const result = await applyProgramEnrollment(client,enrollment());

  assert.deepEqual(result,{
    status:'applied',
    programId,
    attendanceCount:2,
    holderCreated:true
  });
  assert.equal(client.calls.filter((call) => call.tag === 'insert-attendance').length,2);
  const programInsert = client.calls.find((call) => call.tag === 'insert-program');
  assert.match(programInsert.sql,/eligibility_exception,manual_lock,active/u);
  assert.match(programInsert.sql,/'eligible',\s*\$13,true,true/u);
  assert.equal(programInsert.params[12],'authorized_giveaway_courtesy');

  const audit = client.calls.find((call) => call.tag === 'audit');
  assert.deepEqual(audit.params,[programId,'authorized_giveaway_courtesy',2]);
  assert.match(audit.sql,/'reasonCode',\$2::text/u);
  assert.match(audit.sql,/'historicalAttendanceCount',\$3::integer/u);
  for (const value of [privateName,privateOrder,privateEvent,privateBarcode]) {
    assert.equal(audit.params.includes(value),false);
    assert.equal(audit.sql.includes(value),false);
  }
});

test('repetir el mismo secreto valida el estado exacto sin volver a escribir',async() => {
  const client = fakeClient({ alreadyApplied:true });
  const result = await applyProgramEnrollment(client,enrollment());

  assert.deepEqual(result,{
    status:'already_applied',
    programId,
    attendanceCount:2
  });
  assert.equal(client.calls.some((call) => call.tag.startsWith('insert-')),false);
  assert.equal(client.calls.some((call) => call.tag === 'audit'),false);
});

test('reutiliza un titular exacto sin deduplicar ni sobrescribir sus contactos',async() => {
  const client = fakeClient({ existingHolder:true });
  const result = await applyProgramEnrollment(client,enrollment());

  assert.equal(result.status,'applied');
  assert.equal(result.holderCreated,false);
  assert.equal(client.calls.some((call) => call.tag === 'insert-holder'),false);
  assert.deepEqual(
    client.calls.find((call) => call.tag === 'insert-order').params[3],
    holderId
  );
});

test('rechaza colisiones físicas, aliases y referencias históricas no verificadas',async() => {
  await assert.rejects(
    applyProgramEnrollment(fakeClient({ physicalConflict:true }),enrollment()),
    (error) => error instanceof ProgramEnrollmentError && error.code === 'PHYSICAL_SEAT_CONFLICT'
  );
  await assert.rejects(
    applyProgramEnrollment(fakeClient({ aliasConflict:true }),enrollment()),
    (error) => error instanceof ProgramEnrollmentError && error.code === 'ALIAS_KEY_CONFLICT'
  );
  await assert.rejects(
    applyProgramEnrollment(fakeClient({ missingHistoryImport:true }),enrollment()),
    (error) => error instanceof ProgramEnrollmentError && error.code === 'HISTORY_IMPORT_MISMATCH'
  );
});

test('un historial existente sólo es idempotente cuando coincide exactamente',async() => {
  await assert.rejects(
    applyProgramEnrollment(
      fakeClient({ alreadyApplied:true,attendanceConflict:true }),
      enrollment()
    ),
    (error) => (
      error instanceof ProgramEnrollmentError
      && error.code === 'HISTORY_ATTENDANCE_CONFLICT'
    )
  );
});
