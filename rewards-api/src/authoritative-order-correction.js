import crypto from 'node:crypto';

const ALLOWED_FIELDS = new Set([
  'version',
  'seasonCode',
  'fromOrder',
  'toOrder',
  'expectedProgramCount',
  'expectedProgramSetSha256',
  'expectedHolderIdentityKey',
  'correctedEmail',
  'reasonCode'
]);
const SHA256 = /^[a-f0-9]{64}$/u;
const REASON_CODES = new Set(['boleto-movil-verified']);

function fail(message) {
  throw new Error(`Invalid authoritative order correction: ${message}`);
}

function textField(value, field, maxLength = 200) {
  if (typeof value !== 'string') fail(`${field} must be text`);
  const normalized = value.normalize('NFC').trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001F\u007F]/u.test(normalized)) {
    fail(`${field} has an invalid format`);
  }
  return normalized;
}

function canonical(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu,'')
    .toUpperCase()
    .replace(/\s+/gu,' ')
    .trim();
}

function canonicalSeat(value) {
  return canonical(value).replace(/[^A-Z0-9]/gu,'');
}

function identityPart(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu,'')
    .trim()
    .replace(/\s+/gu,' ')
    .toLocaleLowerCase('es-MX');
}

export function holderIdentityKey({ displayName, email, phone }) {
  return crypto.createHash('sha256').update([
    identityPart(displayName),
    identityPart(email),
    identityPart(phone).replace(/\D/gu,'')
  ].join('|')).digest('hex');
}

export function programSetSha256(programs) {
  const canonicalPrograms = programs.map((program) => [
    canonical(program.zone),
    canonical(program.section),
    canonicalSeat(program.seat)
  ].join('|')).sort();
  return crypto.createHash('sha256').update(canonicalPrograms.join('\n')).digest('hex');
}

export function parseAuthoritativeOrderCorrection(rawValue) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') return null;
  let value;
  try {
    value = JSON.parse(String(rawValue));
  } catch {
    fail('environment value must be valid JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('payload must be an object');
  if (Object.keys(value).some((field) => !ALLOWED_FIELDS.has(field))) fail('payload has unsupported fields');
  if (value.version !== 1) fail('version must be 1');

  const seasonCode = textField(value.seasonCode,'seasonCode',32).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/u.test(seasonCode)) fail('seasonCode has an invalid format');
  const fromOrder = textField(value.fromOrder,'fromOrder',100);
  const toOrder = textField(value.toOrder,'toOrder',100);
  if (fromOrder === toOrder) fail('source and target orders must differ');
  if (!Number.isInteger(value.expectedProgramCount) || value.expectedProgramCount < 1 || value.expectedProgramCount > 1000) {
    fail('expectedProgramCount must be an integer between 1 and 1000');
  }
  const expectedProgramSetSha256 = textField(
    value.expectedProgramSetSha256,'expectedProgramSetSha256',64
  ).toLowerCase();
  const expectedHolderIdentityKey = textField(
    value.expectedHolderIdentityKey,'expectedHolderIdentityKey',64
  ).toLowerCase();
  if (!SHA256.test(expectedProgramSetSha256) || !SHA256.test(expectedHolderIdentityKey)) {
    fail('verification digests must be SHA-256 values');
  }
  const correctedEmail = textField(value.correctedEmail,'correctedEmail',254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(correctedEmail)) fail('correctedEmail has an invalid format');
  const reasonCode = textField(value.reasonCode,'reasonCode',80).toLowerCase();
  if (!REASON_CODES.has(reasonCode)) fail('reasonCode is not supported');

  return {
    version:1,
    seasonCode,
    fromOrder,
    toOrder,
    expectedProgramCount:value.expectedProgramCount,
    expectedProgramSetSha256,
    expectedHolderIdentityKey,
    correctedEmail,
    reasonCode
  };
}

function verifyPrograms(programs, config, expectedOrder) {
  if (programs.length !== config.expectedProgramCount) fail('program count does not match the approved control');
  if (programSetSha256(programs) !== config.expectedProgramSetSha256) {
    fail('program set does not match the approved control');
  }
  const holderIds = new Set(programs.map((program) => program.holder_id).filter(Boolean));
  if (holderIds.size !== 1 || programs.some((program) => !program.holder_id)) {
    fail('programs do not belong to exactly one holder');
  }
  if (programs.some((program) => (
    program.order_number !== expectedOrder
    || program.active !== true
    || program.eligibility_status !== 'eligible'
  ))) fail('program state does not match the approved control');
  return [...holderIds][0];
}

function rowsForOrder(orders, orderNumber) {
  return orders.filter((order) => order.order_number === orderNumber);
}

export async function applyAuthoritativeOrderCorrection(client, config) {
  if (!config) return { status:'disabled',programCount:0 };
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('rewards-authoritative-order-correction:' || $1))",
    [config.seasonCode]
  );

  const ordersResult = await client.query(`
    /* authoritative-correction:orders */
    SELECT id,order_number,active
    FROM rewards_orders
    WHERE season_code=$1 AND order_number IN ($2,$3)
    ORDER BY order_number,id
    FOR UPDATE
  `,[config.seasonCode,config.fromOrder,config.toOrder]);
  const sourceOrders = rowsForOrder(ordersResult.rows,config.fromOrder);
  const targetOrders = rowsForOrder(ordersResult.rows,config.toOrder);
  const applying = sourceOrders.length === 1 && targetOrders.length === 0;
  const alreadyApplied = sourceOrders.length === 0 && targetOrders.length === 1;
  if (!applying && !alreadyApplied) fail('order state is ambiguous');
  const selectedOrder = (applying ? sourceOrders : targetOrders)[0];
  const expectedOrder = applying ? config.fromOrder : config.toOrder;
  if (selectedOrder.active !== true) fail('selected order is not active');

  const programsResult = await client.query(`
    /* authoritative-correction:programs */
    SELECT id,order_number,holder_id,holder_email,zone,section,seat,
           active,eligibility_status,manual_lock
    FROM rewards_programs
    WHERE season_code=$1 AND order_id=$2
    ORDER BY id
    FOR UPDATE
  `,[config.seasonCode,selectedOrder.id]);
  const holderId = verifyPrograms(programsResult.rows,config,expectedOrder);

  const holderPrograms = await client.query(`
    /* authoritative-correction:holder-program-count */
    SELECT id
    FROM rewards_programs
    WHERE holder_id=$1
    ORDER BY id
    FOR UPDATE
  `,[holderId]);
  if (holderPrograms.rowCount !== config.expectedProgramCount) {
    fail('holder is linked to an unexpected number of programs');
  }

  const holderResult = await client.query(`
    /* authoritative-correction:holder */
    SELECT id,identity_key,display_name,email,phone
    FROM rewards_holders
    WHERE id=$1
    FOR UPDATE
  `,[holderId]);
  if (holderResult.rowCount !== 1) fail('holder state is invalid');
  const holder = holderResult.rows[0];
  const correctedIdentityKey = holderIdentityKey({
    displayName:holder.display_name,
    email:config.correctedEmail,
    phone:holder.phone
  });

  const identityConflict = await client.query(`
    /* authoritative-correction:identity-conflict */
    SELECT count(*)::int total
    FROM rewards_holders
    WHERE identity_key=$1 AND id<>$2
  `,[correctedIdentityKey,holderId]);
  if (Number(identityConflict.rows[0]?.total || 0) !== 0) fail('corrected holder identity is not unique');

  if (alreadyApplied) {
    if (
      holder.identity_key !== correctedIdentityKey
      || String(holder.email || '').toLowerCase() !== config.correctedEmail
      || programsResult.rows.some((program) => (
        String(program.holder_email || '').toLowerCase() !== config.correctedEmail
        || program.manual_lock !== true
      ))
    ) fail('target order exists but its correction is incomplete');
    return { status:'already_applied',programCount:programsResult.rows.length };
  }

  if (holder.identity_key !== config.expectedHolderIdentityKey) {
    fail('holder identity does not match the approved control');
  }
  const programIds = programsResult.rows.map((program) => program.id);
  const orderUpdate = await client.query(`
    /* authoritative-correction:update-order */
    UPDATE rewards_orders
    SET order_number=$1,active=true,updated_at=now()
    WHERE id=$2 AND order_number=$3
  `,[config.toOrder,selectedOrder.id,config.fromOrder]);
  if (orderUpdate.rowCount !== 1) fail('order could not be corrected');

  const programUpdate = await client.query(`
    /* authoritative-correction:update-programs */
    UPDATE rewards_programs
    SET order_number=$1,holder_email=$2,manual_lock=true,updated_at=now()
    WHERE id=ANY($3::uuid[])
  `,[config.toOrder,config.correctedEmail,programIds]);
  if (programUpdate.rowCount !== config.expectedProgramCount) fail('programs could not be corrected');

  const holderUpdate = await client.query(`
    /* authoritative-correction:update-holder */
    UPDATE rewards_holders
    SET email=$1,identity_key=$2,updated_at=now()
    WHERE id=$3 AND identity_key=$4
  `,[config.correctedEmail,correctedIdentityKey,holderId,config.expectedHolderIdentityKey]);
  if (holderUpdate.rowCount !== 1) fail('holder could not be corrected');

  await client.query(`
    /* authoritative-correction:audit */
    INSERT INTO rewards_audit(action,entity_type,entity_id,reason,metadata)
    VALUES(
      'roster.authoritative_correction','order',$1,'Verified commercial correction',
      jsonb_build_object(
        'programCount',$2,'reasonCode',$3
      )
    )
  `,[
    selectedOrder.id,
    config.expectedProgramCount,
    config.reasonCode
  ]);
  return { status:'applied',programCount:config.expectedProgramCount };
}
