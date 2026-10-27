import crypto from 'node:crypto';

const identityPart = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'')
  .trim()
  .replace(/\s+/g,' ')
  .toLocaleLowerCase('es-MX');

const holderIdentity = (record) => crypto
  .createHash('sha256')
  .update([
    identityPart(record.holderName),
    identityPart(record.holderEmail),
    identityPart(record.holderPhone).replace(/\D/g,'')
  ].join('|'))
  .digest('hex');

const orderKey = (seasonCode,orderNumber) => `${seasonCode}\u0000${orderNumber}`;

export async function readRosterState(client,seasonCode) {
  const result = await client.query(`
    SELECT
      count(*) FILTER (WHERE p.active AND p.eligibility_status='eligible')::int programs,
      count(DISTINCT p.order_number) FILTER (WHERE p.active AND p.eligibility_status='eligible')::int orders,
      count(DISTINCT p.holder_id) FILTER (
        WHERE p.active AND p.eligibility_status='eligible' AND p.holder_id IS NOT NULL
      )::int holders,
      count(*) FILTER (WHERE p.active AND p.eligibility_status='eligible' AND p.segment='VIP')::int vip,
      count(*) FILTER (WHERE p.active AND p.eligibility_status='eligible' AND p.segment='PREFERENTE')::int preferente,
      count(*) FILTER (WHERE p.active AND p.eligibility_status='eligible' AND p.segment='GENERAL')::int general,
      count(*) FILTER (WHERE p.active AND p.manual_lock)::int manual_locks,
      (SELECT count(*)::int
       FROM rewards_attendance a
       JOIN rewards_programs attendance_program ON attendance_program.id=a.program_id
       WHERE attendance_program.season_code=$1) attendance,
      (SELECT count(*)::int
       FROM rewards_deliveries d
       JOIN rewards_programs delivery_program ON delivery_program.id=d.program_id
       WHERE delivery_program.season_code=$1 AND d.status<>'reversed') deliveries
    FROM rewards_programs p
    WHERE p.season_code=$1
  `,[seasonCode]);
  const row = result.rows[0] || {};
  return {
    programs:Number(row.programs || 0),
    orders:Number(row.orders || 0),
    holders:Number(row.holders || 0),
    bySegment:{
      VIP:Number(row.vip || 0),
      PREFERENTE:Number(row.preferente || 0),
      GENERAL:Number(row.general || 0)
    },
    manualLocks:Number(row.manual_locks || 0),
    attendance:Number(row.attendance || 0),
    deliveries:Number(row.deliveries || 0)
  };
}

export async function previewRoster(client,roster) {
  const current = await readRosterState(client,roster.seasonCode);
  return {
    sha256:roster.sha256,
    current,
    proposed:roster.totals,
    safeToBootstrap:current.attendance === 0 && current.deliveries === 0 && current.manualLocks === 0
  };
}

export async function persistRoster(client,roster,{ sourceFilename }) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('rewards-roster-bootstrap:' || $1))",[roster.seasonCode]);

  const priorImport = await client.query(`
    SELECT id,summary
    FROM rewards_imports
    WHERE sha256=$1 AND kind='sales'
  `,[roster.sha256]);
  if (priorImport.rowCount) {
    return {
      alreadyImported:true,
      importId:priorImport.rows[0].id,
      state:await readRosterState(client,roster.seasonCode)
    };
  }

  const before = await readRosterState(client,roster.seasonCode);
  if (before.attendance || before.deliveries || before.manualLocks) {
    const error = new Error('El padrÃ³n ya tiene actividad o correcciones manuales; requiere una conciliaciÃ³n asistida');
    error.status = 409;
    throw error;
  }

  const actor = await client.query(`
    SELECT id
    FROM rewards_users
    WHERE active AND role='administrator'
    ORDER BY created_at,id
    LIMIT 1
  `);
  if (!actor.rowCount) {
    const error = new Error('No existe un administrador activo para registrar la carga');
    error.status = 409;
    throw error;
  }
  const actorId = actor.rows[0].id;

  const holders = new Map();
  for (const record of roster.records) {
    const identityKey = holderIdentity(record);
    if (holders.has(identityKey)) continue;
    const inserted = await client.query(`
      INSERT INTO rewards_holders(identity_key,display_name,email,phone)
      VALUES($1,$2,$3,$4)
      ON CONFLICT(identity_key) DO UPDATE SET
        display_name=EXCLUDED.display_name,
        email=EXCLUDED.email,
        phone=EXCLUDED.phone,
        active=true,
        updated_at=now()
      RETURNING id
    `,[identityKey,record.holderName,record.holderEmail || null,record.holderPhone || null]);
    holders.set(identityKey,inserted.rows[0].id);
  }

  await client.query(`
    UPDATE rewards_orders
    SET active=false,updated_at=now()
    WHERE season_code=$1 AND active
  `,[roster.seasonCode]);

  const recordsByOrder = new Map();
  for (const record of roster.records) {
    const key = orderKey(roster.seasonCode,record.orderNumber);
    if (!recordsByOrder.has(key)) recordsByOrder.set(key,[]);
    recordsByOrder.get(key).push(record);
  }
  const orders = new Map();
  for (const [key,records] of recordsByOrder) {
    const first = records[0];
    const holderIds = [...new Set(records.map((record) => holders.get(holderIdentity(record))))];
    const inserted = await client.query(`
      INSERT INTO rewards_orders(
        season_code,order_number,purchase_code,buyer_holder_id,seller,discount_label,
        purchased_at,payment_type,source_event
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(season_code,order_number) DO UPDATE SET
        purchase_code=COALESCE(EXCLUDED.purchase_code,rewards_orders.purchase_code),
        buyer_holder_id=EXCLUDED.buyer_holder_id,
        seller=COALESCE(EXCLUDED.seller,rewards_orders.seller),
        discount_label=COALESCE(EXCLUDED.discount_label,rewards_orders.discount_label),
        purchased_at=COALESCE(EXCLUDED.purchased_at,rewards_orders.purchased_at),
        payment_type=COALESCE(EXCLUDED.payment_type,rewards_orders.payment_type),
        source_event=EXCLUDED.source_event,
        active=true,
        updated_at=now()
      RETURNING id
    `,[
      roster.seasonCode,first.orderNumber,first.purchaseCode || null,
      holderIds.length === 1 ? holderIds[0] : null,first.seller || null,
      first.discountLabel || null,first.purchasedAt || null,first.paymentType || null,
      first.sourceEvent
    ]);
    orders.set(key,inserted.rows[0].id);
  }

  await client.query(`
    UPDATE rewards_programs
    SET active=false,eligibility_status='excluded',updated_at=now()
    WHERE season_code=$1 AND active
  `,[roster.seasonCode]);

  for (const record of roster.records) {
    const holderId = holders.get(holderIdentity(record));
    const linkedOrderId = orders.get(orderKey(roster.seasonCode,record.orderNumber));
    const inserted = await client.query(`
      INSERT INTO rewards_programs(
        season_code,order_number,purchase_code,holder_name,holder_email,holder_phone,
        zone,section,seat,barcode,source_event,segment,eligibility_status,active,
        holder_id,order_id,source_reference
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'eligible',true,$13,$14,$15)
      ON CONFLICT(season_code,order_number,zone,section,seat) DO UPDATE SET
        purchase_code=EXCLUDED.purchase_code,
        holder_name=EXCLUDED.holder_name,
        holder_email=EXCLUDED.holder_email,
        holder_phone=EXCLUDED.holder_phone,
        barcode=COALESCE(EXCLUDED.barcode,rewards_programs.barcode),
        source_event=EXCLUDED.source_event,
        segment=EXCLUDED.segment,
        eligibility_status='eligible',
        active=true,
        holder_id=EXCLUDED.holder_id,
        order_id=EXCLUDED.order_id,
        source_reference=EXCLUDED.source_reference,
        updated_at=now()
      WHERE NOT rewards_programs.manual_lock
      RETURNING id
    `,[
      roster.seasonCode,record.orderNumber,record.purchaseCode || null,record.holderName,
      record.holderEmail || null,record.holderPhone || null,record.zone,record.section,
      record.seat,record.barcode || null,record.sourceEvent,record.segment,holderId,
      linkedOrderId,record.sourceReference || null
    ]);
    if (!inserted.rowCount) {
      const error = new Error('Una butaca tiene una correcciÃ³n manual y no puede sobrescribirse');
      error.status = 409;
      throw error;
    }
  }

  const physicalDuplicates = await client.query(`
    SELECT count(*)::int total
    FROM (
      SELECT zone,section,seat
      FROM rewards_programs
      WHERE season_code=$1 AND active AND eligibility_status='eligible'
      GROUP BY zone,section,seat
      HAVING count(*)>1
    ) duplicated
  `,[roster.seasonCode]);
  if (Number(physicalDuplicates.rows[0]?.total || 0) !== 0) {
    const error = new Error('La conciliaciÃ³n producirÃ­a butacas fÃ­sicas duplicadas');
    error.status = 409;
    throw error;
  }

  const historicalContinuity = await client.query(`
    SELECT
      (SELECT count(*)::int
       FROM rewards_programs p
       WHERE p.season_code=$1
         AND p.order_number='15772800'
         AND regexp_replace(upper(p.section),'[^A-Z0-9]','','g')='103'
         AND regexp_replace(upper(p.seat),'[^A-Z0-9]','','g') IN ('B1','B2')
         AND p.active
         AND p.eligibility_status='eligible') target_programs,
      (SELECT count(*)::int
       FROM rewards_program_aliases a
       JOIN rewards_programs p ON p.id=a.program_id
       WHERE a.season_code=$1
         AND a.historical_order_number='15551242'
         AND a.historical_zone='Butaca Preferente Tercera Base'
         AND a.historical_section='219'
         AND a.active
         AND p.order_number='15772800'
         AND regexp_replace(upper(p.section),'[^A-Z0-9]','','g')='103'
         AND (
           (a.historical_seat='G1' AND regexp_replace(upper(p.seat),'[^A-Z0-9]','','g')='B1')
           OR
           (a.historical_seat='G2' AND regexp_replace(upper(p.seat),'[^A-Z0-9]','','g')='B2')
         )) historical_aliases
  `,[roster.seasonCode]);
  const continuity = historicalContinuity.rows[0] || {};
  if (Number(continuity.target_programs || 0) !== 2
      || Number(continuity.historical_aliases || 0) !== 2) {
    const error = new Error('La continuidad histórica de las butacas B1-B2 no quedó completa');
    error.status = 409;
    throw error;
  }

  const after = await readRosterState(client,roster.seasonCode);
  if (after.programs !== roster.totals.programs
      || after.orders !== roster.totals.orders
      || after.holders !== roster.totals.holders
      || Object.entries(roster.totals.bySegment).some(([segment,total]) => after.bySegment[segment] !== total)) {
    const error = new Error('Los totales persistidos no coinciden con el padrÃ³n validado');
    error.status = 409;
    throw error;
  }

  const summary = { before,after,sha256:roster.sha256 };
  const imported = await client.query(`
    INSERT INTO rewards_imports(kind,sha256,original_filename,summary,imported_by)
    VALUES('sales',$1,$2,$3,$4)
    RETURNING id
  `,[roster.sha256,String(sourceFilename).slice(0,200),JSON.stringify(summary),actorId]);
  await client.query(`
    INSERT INTO rewards_audit(actor_id,action,entity_type,entity_id,metadata)
    VALUES($1,'roster.bootstrap.confirmed','import',$2,$3)
  `,[actorId,imported.rows[0].id,JSON.stringify(summary)]);

  return { alreadyImported:false,importId:imported.rows[0].id,before,state:after };
}
