import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAuthoritativeOrderCorrection,
  AuthoritativeCorrectionError,
  holderIdentityKey,
  parseAuthoritativeOrderCorrection,
  programSetSha256,
  safeCorrectionFailureLog
} from '../src/authoritative-order-correction.js';

const sourceOrder = 'ORDER-SOURCE';
const targetOrder = 'ORDER-TARGET';
const holderId = '00000000-0000-4000-8000-000000000001';
const orderId = '00000000-0000-4000-8000-000000000002';
const correctedEmail = 'corrected@example.test';
const holderProfile = {
  displayName:'Synthetic Holder',
  email:null,
  phone:'0000000000'
};
const programs = [
  {
    id:'00000000-0000-4000-8000-000000000011',order_number:sourceOrder,
    holder_id:holderId,holder_email:null,zone:'Synthetic Zone',section:'A',seat:'1',
    active:true,eligibility_status:'eligible',manual_lock:false
  },
  {
    id:'00000000-0000-4000-8000-000000000012',order_number:sourceOrder,
    holder_id:holderId,holder_email:null,zone:'Synthetic Zone',section:'A',seat:'2',
    active:true,eligibility_status:'eligible',manual_lock:false
  }
];

function correction(overrides = {}) {
  return parseAuthoritativeOrderCorrection(JSON.stringify({
    version:1,
    seasonCode:'TEST-2026',
    fromOrder:sourceOrder,
    toOrder:targetOrder,
    expectedProgramCount:2,
    expectedProgramSetSha256:programSetSha256(programs),
    expectedHolderIdentityKey:holderIdentityKey(holderProfile),
    correctedEmail,
    reasonCode:'boleto-movil-verified',
    ...overrides
  }));
}

function assertCorrectionError(action, expectedCode) {
  assert.throws(action,(error) => (
    error instanceof AuthoritativeCorrectionError
    && error.code === expectedCode
    && error.message === 'Authoritative order correction validation failed.'
  ));
}

function fakeClient({ alreadyApplied = false, orderActive = true, throwAt = null } = {}) {
  const calls = [];
  const correctedIdentityKey = holderIdentityKey({ ...holderProfile,email:correctedEmail });
  const rows = programs.map((program) => alreadyApplied ? {
    ...program,
    order_number:targetOrder,
    holder_email:correctedEmail,
    manual_lock:true
  } : program);
  return {
    calls,
    async query(sql,params = []) {
      const tag = sql.match(/authoritative-correction:([a-z-]+)/u)?.[1] || 'lock';
      calls.push({ tag,params,sql });
      if (tag === throwAt) throw new Error(`${sourceOrder} ${targetOrder} ${correctedEmail}`);
      if (tag === 'lock') return { rowCount:1,rows:[] };
      if (tag === 'orders') return {
        rowCount:1,
        rows:[{ id:orderId,order_number:alreadyApplied ? targetOrder : sourceOrder,active:orderActive }]
      };
      if (tag === 'programs') return { rowCount:2,rows };
      if (tag === 'holder-program-count') return {
        rowCount:2,
        rows:programs.map((program) => ({ id:program.id }))
      };
      if (tag === 'holder') return {
        rowCount:1,
        rows:[{
          id:holderId,
          identity_key:alreadyApplied ? correctedIdentityKey : holderIdentityKey(holderProfile),
          display_name:holderProfile.displayName,
          phone:holderProfile.phone,
          email:alreadyApplied ? correctedEmail : holderProfile.email
        }]
      };
      if (tag === 'identity-conflict') return { rowCount:1,rows:[{ total:0 }] };
      if (tag === 'update-order') return { rowCount:1,rows:[] };
      if (tag === 'update-programs') return { rowCount:2,rows:[] };
      if (tag === 'update-holder') return { rowCount:1,rows:[] };
      if (tag === 'audit') return { rowCount:1,rows:[] };
      throw new Error(`Unexpected query tag: ${tag}`);
    }
  };
}

test('la correccion temporal se configura sin guardar datos operativos en el codigo',() => {
  assert.equal(parseAuthoritativeOrderCorrection(''),null);
  const parsed = correction();
  assert.equal(parsed.fromOrder,sourceOrder);
  assert.equal(parsed.correctedEmail,correctedEmail);
  assertCorrectionError(() => correction({ unexpected:'field' }),'CONFIG_UNSUPPORTED_FIELD');
  assertCorrectionError(
    () => correction({ expectedProgramSetSha256:'not-a-digest' }),
    'CONFIG_DIGEST_INVALID'
  );
  assertCorrectionError(() => correction({ reasonCode:'free-form-value' }),'CONFIG_REASON_INVALID');
});

test('los diagnosticos no exponen valores privados ni errores inesperados',() => {
  const known = new AuthoritativeCorrectionError('HOLDER_IDENTITY_MISMATCH');
  assert.equal(
    safeCorrectionFailureLog(known),
    'Authoritative order correction failed [HOLDER_IDENTITY_MISMATCH]; no correction was committed.'
  );
  const unexpected = new Error(`${sourceOrder} ${targetOrder} ${correctedEmail}`);
  const safeMessage = safeCorrectionFailureLog(unexpected);
  assert.equal(
    safeMessage,
    'Authoritative order correction failed [UNEXPECTED_ERROR]; no correction was committed.'
  );
  assert.equal(safeMessage.includes(sourceOrder),false);
  assert.equal(safeMessage.includes(targetOrder),false);
  assert.equal(safeMessage.includes(correctedEmail),false);
  assert.equal(
    safeCorrectionFailureLog({ code:`HOLDER_${correctedEmail}` }),
    'Authoritative order correction failed [UNEXPECTED_ERROR]; no correction was committed.'
  );
});

test('los errores de PostgreSQL se convierten en una etapa cerrada sin copiar su detalle',async() => {
  await assert.rejects(
    applyAuthoritativeOrderCorrection(fakeClient({ throwAt:'programs' }),correction()),
    (error) => (
      error instanceof AuthoritativeCorrectionError
      && error.code === 'DB_PROGRAMS_READ_FAILED'
      && !error.message.includes(sourceOrder)
      && !error.message.includes(targetOrder)
      && !error.message.includes(correctedEmail)
    )
  );
});

test('corrige orden, programas y titular en sitio sin tocar sus identificadores',async() => {
  const client = fakeClient();
  const result = await applyAuthoritativeOrderCorrection(client,correction());

  assert.deepEqual(result,{ status:'applied',programCount:2 });
  assert.deepEqual(
    client.calls.filter((call) => call.tag.startsWith('update-')).map((call) => call.tag),
    ['update-order','update-programs','update-holder']
  );
  const programUpdate = client.calls.find((call) => call.tag === 'update-programs');
  assert.deepEqual(programUpdate.params[2],programs.map((program) => program.id));
  const audit = client.calls.find((call) => call.tag === 'audit');
  assert.equal(audit.params.includes(sourceOrder),false);
  assert.equal(audit.params.includes(targetOrder),false);
  assert.equal(audit.params.includes(correctedEmail),false);
  assert.deepEqual(audit.params,[orderId,2,'boleto-movil-verified']);
  for (const tag of ['orders','programs','holder-program-count','holder']) {
    assert.match(client.calls.find((call) => call.tag === tag).sql,/FOR UPDATE/u);
  }
});

test('un reinicio posterior valida la correccion sin volver a escribir',async() => {
  const client = fakeClient({ alreadyApplied:true });
  const result = await applyAuthoritativeOrderCorrection(client,correction());

  assert.deepEqual(result,{ status:'already_applied',programCount:2 });
  assert.equal(client.calls.some((call) => call.tag.startsWith('update-')),false);
  assert.equal(client.calls.some((call) => call.tag === 'audit'),false);
});

test('rechaza una orden destino inactiva aunque los demas controles coincidan',async() => {
  await assert.rejects(
    applyAuthoritativeOrderCorrection(
      fakeClient({ alreadyApplied:true,orderActive:false }),
      correction()
    ),
    (error) => error instanceof AuthoritativeCorrectionError && error.code === 'ORDER_INACTIVE'
  );
});
