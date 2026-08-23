import { randomUUID } from 'node:crypto';
import {
  buildPromotionPlan,
  PROMOTION_PIPELINE_RELEASE,
  PROMOTION_VERSION
} from './promotion-plan.js';
import { assertPromotionExpectations } from './promotion-write-guard.js';

const CONTRACT = Object.freeze({
  import_promotion_runs: [
    'id', 'import_batch_id', 'promotion_version', 'pipeline_release',
    'config_version', 'config_sha256', 'plan_sha256'
  ],
  import_promotion_entities: [
    'promotion_run_id', 'source_record_id', 'entity_type', 'entity_id', 'decision_reason'
  ],
  import_batches: [
    'id', 'source_sha256', 'status', 'uploaded_by',
    'config_version', 'config_sha256', 'importer_release'
  ],
  source_records: ['id', 'import_batch_id', 'resolution', 'normalized_payload', 'contact_id'],
  contacts: ['id', 'email', 'phone', 'created_at', 'updated_at'],
  campaigns: ['id', 'name', 'channel', 'created_at']
});

export async function inspectPromotion({
  batchId,
  promotedBy,
  historicalCutoffAt,
  operationalCutoverAt,
  client: suppliedClient,
  databaseUrl,
  connectionConfig
}) {
  return withClient({ client: suppliedClient, databaseUrl, connectionConfig }, async (client) => {
    await assertPromotionDatabaseContract(client);
    await assertPromotionAdmin(client, promotedBy);
    const snapshot = await loadPromotionSnapshot(client, batchId);
    const plan = buildPromotionPlan(snapshot, { promotedBy, historicalCutoffAt, operationalCutoverAt });
    assertBatchMatchesPlan(snapshot.batch, plan);
    return plan;
  });
}

export async function commitPromotion({
  batchId,
  promotedBy,
  historicalCutoffAt,
  operationalCutoverAt,
  authorization,
  client: suppliedClient,
  databaseUrl,
  connectionConfig,
  randomUUIDFn = randomUUID
}) {
  return withClient({ client: suppliedClient, databaseUrl, connectionConfig }, async (client) => {
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("SET LOCAL statement_timeout = '10min'");
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',
        [`charros-crm-promotion:${batchId}`]);
      await assertPromotionDatabaseContract(client);
      await assertPromotionAdmin(client, promotedBy);

      const prior = await client.query(
        `SELECT r.id,r.plan_sha256,r.metrics,r.pipeline_release,r.config_version,r.config_sha256,
                b.importer_release AS batch_importer_release,
                b.config_version AS batch_config_version,b.config_sha256 AS batch_config_sha256
           FROM import_promotion_runs r
           JOIN import_batches b ON b.id=r.import_batch_id
          WHERE r.import_batch_id=$1 AND r.promotion_version=$2 FOR UPDATE OF r,b`,
        [batchId, PROMOTION_VERSION]
      );
      if (prior.rowCount === 1) {
        assertExistingPromotion(prior.rows[0], authorization);
        await client.query('COMMIT');
        return { status: 'already_promoted', promotionRunId: prior.rows[0].id,
          planSha256: prior.rows[0].plan_sha256, metrics: prior.rows[0].metrics };
      }

      // Read staging once only to derive every identity lock. Re-read all
      // canonical state after obtaining the same ordered advisory locks used by
      // manual registration, closing the check/insert race.
      const preliminary = await loadPromotionSnapshot(client, batchId);
      await lockPromotionIdentities(client, preliminary);
      const snapshot = await loadPromotionSnapshot(client, batchId, { forUpdate: true });
      const plan = buildPromotionPlan(snapshot, {
        promotedBy, historicalCutoffAt, operationalCutoverAt
      });
      assertBatchMatchesPlan(snapshot.batch, plan);
      assertPromotionExpectations(plan, authorization);
      const runId = randomUUIDFn();

      await bulkInsertCanonical(client, plan.operations);
      await assertHistoricalPostconditions(client, plan);
      const resolved = plan.decisions.filter((decision) =>
        ['created', 'matched', 'ignored'].includes(decision.disposition));
      if (resolved.length > 0) {
        const result = await client.query(
          `UPDATE source_records sr SET
             resolution=x.resolution,
             resolution_reason=x.reason,
             contact_id=x.contact_id
           FROM jsonb_to_recordset($1::jsonb)
             AS x(id uuid,resolution text,reason text,contact_id uuid)
           WHERE sr.id=x.id AND sr.import_batch_id=$2 AND sr.resolution='pending_review'`,
          [JSON.stringify(resolved.map((decision) => ({
            id: decision.id,
            resolution: decision.disposition,
            reason: decision.reason,
            contact_id: decision.contactId
          }))), batchId]
        );
        if (result.rowCount !== resolved.length) throw safeError('PROMOTION_SOURCE_RESOLUTION_RACE');
      }

      const runInsert = await client.query(
        `INSERT INTO import_promotion_runs
          (id,import_batch_id,promotion_version,pipeline_release,config_version,config_sha256,
           plan_sha256,historical_cutoff_at,operational_cutover_at,promoted_by,metrics)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
        [runId, batchId, plan.promotionVersion, plan.pipelineRelease, plan.configVersion,
          plan.configSha256, plan.planSha256, plan.historicalCutoffAt,
          plan.operationalCutoverAt, promotedBy, JSON.stringify(plan.metrics)]
      );
      if (runInsert.rowCount !== 1) throw safeError('PROMOTION_RUN_COUNT_MISMATCH');

      const ledger = [
        ...plan.operations.map((operation) => ({
          source_record_id: operation.sourceRecordId,
          entity_type: operation.type,
          entity_id: operation.entityId,
          action: operation.action,
          historical_occurred_at: operation.historicalAt,
          decision_reason: null
        })),
        ...plan.decisions.map((decision) => ({
          source_record_id: decision.id,
          entity_type: 'source_resolution',
          entity_id: decision.id,
          action: decision.disposition,
          historical_occurred_at: plan.historicalCutoffAt,
          decision_reason: decision.reason
        }))
      ];
      if (ledger.length > 0) {
        const ledgerInsert = await client.query(
          `INSERT INTO import_promotion_entities
            (promotion_run_id,source_record_id,entity_type,entity_id,action,
             historical_occurred_at,decision_reason)
           SELECT $1,x.source_record_id,x.entity_type,x.entity_id,x.action,
             x.historical_occurred_at,x.decision_reason
           FROM jsonb_to_recordset($2::jsonb) AS x(
             source_record_id uuid,entity_type text,entity_id uuid,action text,
             historical_occurred_at timestamptz,decision_reason text
           )`,
          [runId, JSON.stringify(ledger)]
        );
        if (ledgerInsert.rowCount !== ledger.length) {
          throw safeError('PROMOTION_LEDGER_COUNT_MISMATCH');
        }
      }

      const unresolved = await client.query(
        "SELECT count(*)::integer AS count FROM source_records WHERE import_batch_id=$1 AND resolution='pending_review'",
        [batchId]
      );
      if (unresolved.rows[0].count === 0) {
        await client.query("UPDATE import_batches SET status='imported' WHERE id=$1 AND status='validated'", [batchId]);
      }
      const auditInsert = await client.query(
        `INSERT INTO audit_events
          (actor_id,action,entity_type,entity_id,request_id,metadata)
         VALUES ($1,'import.initial_historical_promoted','import_batch',$2,$3,$4::jsonb)`,
        [promotedBy, String(batchId), randomUUIDFn(), JSON.stringify({
          promotionRunId: runId,
          promotionVersion: plan.promotionVersion,
          planSha256: plan.planSha256,
          metrics: plan.metrics,
          historicalCutoffAt: plan.historicalCutoffAt,
          operationalCutoverAt: plan.operationalCutoverAt
        })]
      );
      if (auditInsert.rowCount !== 1) throw safeError('PROMOTION_AUDIT_COUNT_MISMATCH');
      await client.query('COMMIT');
      return { status: 'promoted', promotionRunId: runId, planSha256: plan.planSha256,
        metrics: plan.metrics, unresolvedRecords: unresolved.rows[0].count };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error?.code?.startsWith?.('PROMOTION_')) throw error;
      throw safeError('PROMOTION_TRANSACTION_FAILED');
    }
  });
}

export async function loadPromotionSnapshot(client, batchId, { forUpdate = false } = {}) {
  const batchResult = await client.query(
    `SELECT id,source_sha256,status,uploaded_by,created_at,completed_at,
            config_version,config_sha256,importer_release
     FROM import_batches WHERE id=$1 ${forUpdate ? 'FOR UPDATE' : ''}`,
    [batchId]
  );
  if (batchResult.rowCount !== 1) throw safeError('PROMOTION_BATCH_NOT_FOUND');
  const sourceResult = await client.query(
    `SELECT id,source_sheet,source_row_number,source_record_id,resolution,
            resolution_reason,contact_id,raw_payload,normalized_payload
     FROM source_records WHERE import_batch_id=$1
     ORDER BY source_sheet,source_row_number,id ${forUpdate ? 'FOR UPDATE' : ''}`,
    [batchId]
  );
  const [candidateResult, contactResult, aliasResult, seasonResult, priorResult] = await Promise.all([
    client.query(
      `SELECT left_source_record_id,right_source_record_id,confidence,review_status,rule_codes
       FROM import_match_candidates WHERE import_batch_id=$1`, [batchId]
    ),
    client.query(
      `SELECT id,external_ref,first_name,last_name,email,phone,deleted_at,created_at
       FROM contacts ${forUpdate ? 'FOR UPDATE' : ''}`, []
    ),
    client.query(
      `SELECT a.contact_id,a.alias_type,a.alias_value,c.deleted_at
       FROM contact_aliases a JOIN contacts c ON c.id=a.contact_id`, []
    ),
    client.query('SELECT code FROM seasons', []),
    client.query(
      `SELECT id,plan_sha256,metrics FROM import_promotion_runs
       WHERE import_batch_id=$1 AND promotion_version=$2`, [batchId, PROMOTION_VERSION]
    )
  ]);
  return {
    batch: {
      id: batchResult.rows[0].id,
      sourceSha256: batchResult.rows[0].source_sha256,
      status: batchResult.rows[0].status,
      uploadedBy: batchResult.rows[0].uploaded_by,
      configVersion: batchResult.rows[0].config_version,
      configSha256: batchResult.rows[0].config_sha256,
      importerRelease: batchResult.rows[0].importer_release
    },
    sourceRecords: sourceResult.rows.map((row) => ({
      id: row.id,
      sourceSheet: row.source_sheet,
      sourceRowNumber: row.source_row_number,
      sourceRecordId: row.source_record_id,
      resolution: row.resolution,
      resolutionReason: row.resolution_reason,
      contactId: row.contact_id,
      rawPayload: row.raw_payload,
      normalizedPayload: row.normalized_payload
    })),
    matchCandidates: candidateResult.rows.map((row) => ({
      leftSourceRecordId: row.left_source_record_id,
      rightSourceRecordId: row.right_source_record_id,
      confidence: row.confidence,
      reviewStatus: row.review_status,
      ruleCodes: row.rule_codes
    })),
    canonicalContacts: contactResult.rows.map((row) => ({
      id: row.id, externalRef: row.external_ref, firstName: row.first_name,
      lastName: row.last_name, email: row.email, phone: row.phone,
      deletedAt: row.deleted_at, createdAt: row.created_at
    })),
    canonicalAliases: aliasResult.rows.map((row) => ({
      contactId: row.contact_id, aliasType: row.alias_type,
      aliasValue: row.alias_value, deletedAt: row.deleted_at
    })),
    seasons: seasonResult.rows.map((row) => row.code),
    existingPromotion: priorResult.rows[0] ?? null
  };
}

export function promotionIdentityKeys(snapshot) {
  const keys = new Set();
  for (const record of snapshot.sourceRecords ?? []) {
    for (const contact of record.normalizedPayload?.entities?.contacts ?? []) {
      if (contact.emailNormalized) keys.add(`email:${String(contact.emailNormalized).trim().toLowerCase()}`);
      const phone = canonicalPhone(contact.phoneNormalized);
      if (phone) keys.add(`phone:${phone}`);
    }
    for (const alias of record.normalizedPayload?.entities?.contact_aliases ?? []) {
      if (alias.valid !== true) continue;
      if (alias.aliasType === 'email' && alias.normalizedValue) {
        keys.add(`email:${String(alias.normalizedValue).trim().toLowerCase()}`);
      }
      if (alias.aliasType === 'phone') {
        const phone = canonicalPhone(alias.normalizedValue);
        if (phone) keys.add(`phone:${phone}`);
      }
    }
    for (const message of record.normalizedPayload?.entities?.campaign_messages ?? []) {
      if (message.recipientNormalized) {
        keys.add(`email:${String(message.recipientNormalized).trim().toLowerCase()}`);
      }
    }
  }
  return [...keys].sort();
}

function canonicalPhone(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  let digits = String(value).replace(/\D+/gu, '');
  if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2);
  if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3);
  return digits.length === 10 ? digits : null;
}

async function lockPromotionIdentities(client, snapshot) {
  const keys = promotionIdentityKeys(snapshot);
  if (keys.length === 0) return;
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('manual-registration-identity:' || identity_key,0))
       FROM unnest($1::text[]) AS keys(identity_key)
      ORDER BY keys.identity_key`,
    [keys]
  );
}

async function bulkInsertCanonical(client, operations) {
  await insertContacts(client, dataFor(operations, 'contact'));
  await insertAliases(client, dataFor(operations, 'contact_alias'));
  await insertConsents(client, dataFor(operations, 'contact_consent'));
  await insertMemberships(client, dataFor(operations, 'membership'));
  await insertMembershipUnits(client, dataFor(operations, 'membership_unit'));
  await insertTasks(client, dataFor(operations, 'task'));
  await insertCampaigns(client, dataFor(operations, 'campaign'));
  await insertCampaignMessages(client, dataFor(operations, 'campaign_message'));
}

async function insertContacts(client, rows) {
  if (!rows.length) return;
  const result = await client.query(
    `INSERT INTO contacts (
       id,external_ref,first_name,last_name,email,phone,municipality,subscriber_status,
       commercial_stage,preferred_channel,executive_id,source,acquisition_source,
       declared_tenure_seasons,consent_status,consent_at,privacy_notice_version,
       summary_notes,last_human_contact_at,next_follow_up_at,created_by,updated_by,
       created_at,updated_at)
     SELECT x.id,x.external_ref,x.first_name,x.last_name,x.email,x.phone,x.municipality,
       x.subscriber_status,x.commercial_stage,x.preferred_channel,x.executive_id,x.source,
       x.acquisition_source,x.declared_tenure_seasons,x.consent_status,x.consent_at,
       x.privacy_notice_version,x.summary_notes,NULL,x.next_follow_up_at,x.created_by,
       x.updated_by,x.created_at,x.updated_at
     FROM jsonb_to_recordset($1::jsonb) AS x(
       id uuid,external_ref text,first_name text,last_name text,email text,phone text,
       municipality text,subscriber_status text,commercial_stage text,preferred_channel text,
       executive_id uuid,source text,acquisition_source text,declared_tenure_seasons smallint,
       consent_status text,consent_at timestamptz,privacy_notice_version text,summary_notes text,
       next_follow_up_at timestamptz,created_by uuid,updated_by uuid,created_at timestamptz,
       updated_at timestamptz)`,
    [JSON.stringify(rows.map((row) => snakeContact(row)))]
  );
  assertInserted(result, rows, 'contacts');
}

async function insertAliases(client, rows) {
  if (!rows.length) return;
  const result = await client.query(
    `INSERT INTO contact_aliases (id,contact_id,alias_type,alias_value,source_system,created_at)
     SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
       id uuid,contact_id uuid,alias_type text,alias_value text,source_system text,created_at timestamptz)`,
    [JSON.stringify(rows.map((row) => ({ id: row.id, contact_id: row.contactId,
      alias_type: row.aliasType, alias_value: row.aliasValue,
      source_system: row.sourceSystem, created_at: row.createdAt })))]
  );
  assertInserted(result, rows, 'contact_aliases');
}

async function insertConsents(client, rows) {
  if (!rows.length) return;
  const result = await client.query(
    `INSERT INTO contact_consents
      (id,contact_id,status,purpose,captured_at,source,privacy_notice_version,evidence_ref,recorded_by,created_at)
     SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
       id uuid,contact_id uuid,status text,purpose text,captured_at timestamptz,source text,
       privacy_notice_version text,evidence_ref text,recorded_by uuid,created_at timestamptz)`,
    [JSON.stringify(rows.map((row) => ({ id: row.id, contact_id: row.contactId,
      status: row.status, purpose: row.purpose, captured_at: row.capturedAt,
      source: row.source, privacy_notice_version: row.privacyNoticeVersion,
      evidence_ref: row.evidenceRef, recorded_by: row.recordedBy, created_at: row.createdAt })))]
  );
  assertInserted(result, rows, 'contact_consents');
}

async function insertMemberships(client, rows) {
  if (!rows.length) return;
  const result = await client.query(
    `INSERT INTO memberships
      (id,contact_id,season_code,membership_status,seat_count,seat_identifier,zone,product,
       start_date,renewal_date,created_by,updated_by,created_at,updated_at)
     SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
       id uuid,contact_id uuid,season_code text,membership_status text,seat_count integer,
       seat_identifier text,zone text,product text,start_date date,renewal_date date,
       created_by uuid,updated_by uuid,created_at timestamptz,updated_at timestamptz)`,
    [JSON.stringify(rows.map((row) => ({ id: row.id, contact_id: row.contactId,
      season_code: row.seasonCode, membership_status: row.membershipStatus,
      seat_count: row.seatCount, seat_identifier: null, zone: row.zone, product: row.product,
      start_date: row.startedAt, renewal_date: row.renewedAt, created_by: row.createdBy,
      updated_by: row.updatedBy, created_at: row.createdAt, updated_at: row.updatedAt })))]
  );
  assertInserted(result, rows, 'memberships');
}

async function insertMembershipUnits(client, rows) {
  if (!rows.length) return;
  const result = await client.query(
    `INSERT INTO membership_units
      (id,membership_id,unit_number,seat_identifier,zone,product,jersey_size,
       created_by,updated_by,created_at,updated_at)
     SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
       id uuid,membership_id uuid,unit_number integer,seat_identifier text,zone text,
       product text,jersey_size text,created_by uuid,updated_by uuid,
       created_at timestamptz,updated_at timestamptz)`,
    [JSON.stringify(rows.map((row) => ({ id: row.id, membership_id: row.membershipId,
      unit_number: row.unitNumber, seat_identifier: row.seatIdentifier, zone: row.zone,
      product: row.product, jersey_size: row.jerseySize, created_by: row.createdBy,
      updated_by: row.updatedBy, created_at: row.createdAt, updated_at: row.updatedAt })))]
  );
  assertInserted(result, rows, 'membership_units');
}

async function insertTasks(client, rows) {
  if (!rows.length) return;
  const result = await client.query(
    `INSERT INTO tasks
      (id,contact_id,assigned_to,created_by,description,due_at,priority,status,created_at,updated_at)
     SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
       id uuid,contact_id uuid,assigned_to uuid,created_by uuid,description text,
       due_at timestamptz,priority text,status text,created_at timestamptz,updated_at timestamptz)`,
    [JSON.stringify(rows.map((row) => ({ id: row.id, contact_id: row.contactId,
      assigned_to: row.assignedTo, created_by: row.createdBy, description: row.description,
      due_at: row.dueAt, priority: row.priority, status: row.status,
      created_at: row.createdAt, updated_at: row.updatedAt })))]
  );
  assertInserted(result, rows, 'tasks');
}

async function insertCampaigns(client, rows) {
  if (!rows.length) return;
  const result = await client.query(
    `INSERT INTO campaigns (id,name,channel,created_by,created_at)
     SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
       id uuid,name text,channel text,created_by uuid,created_at timestamptz)`,
    [JSON.stringify(rows.map((row) => ({ id: row.id, name: row.name, channel: row.channel,
      created_by: row.createdBy, created_at: row.createdAt })))]
  );
  assertInserted(result, rows, 'campaigns');
}

async function insertCampaignMessages(client, rows) {
  if (!rows.length) return;
  const result = await client.query(
    `INSERT INTO campaign_messages
      (id,campaign_id,contact_id,destination_hash,provider_message_id,sent_at,delivered_at,
       opened_at,clicked_at,bounced_at,unsubscribed_at,created_at)
     SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
       id uuid,campaign_id uuid,contact_id uuid,destination_hash text,provider_message_id text,
       sent_at timestamptz,delivered_at timestamptz,opened_at timestamptz,clicked_at timestamptz,
       bounced_at timestamptz,unsubscribed_at timestamptz,created_at timestamptz)`,
    [JSON.stringify(rows.map((row) => ({ id: row.id, campaign_id: row.stagedCampaignId,
      contact_id: row.contactId, destination_hash: row.destinationHash,
      provider_message_id: row.providerId, sent_at: row.sentAt, delivered_at: row.deliveredAt,
      opened_at: row.openedAt, clicked_at: row.clickedAt, bounced_at: row.bouncedAt,
      unsubscribed_at: row.unsubscribedAt, created_at: row.createdAt })))]
  );
  assertInserted(result, rows, 'campaign_messages');
}

function dataFor(operations, type) {
  return operations.filter((operation) => operation.type === type).map((operation) => operation.data);
}

function snakeContact(row) {
  return {
    id: row.id, external_ref: row.externalRef, first_name: row.firstName, last_name: row.lastName,
    email: row.email, phone: row.phone, municipality: row.municipality,
    subscriber_status: row.subscriberStatus, commercial_stage: row.commercialStage,
    preferred_channel: row.preferredChannel, executive_id: row.executiveId, source: row.source,
    acquisition_source: row.acquisitionSource, declared_tenure_seasons: row.declaredTenureSeasons,
    consent_status: row.consentStatus, consent_at: row.consentAt,
    privacy_notice_version: row.privacyNoticeVersion, summary_notes: row.summaryNotes,
    next_follow_up_at: row.nextFollowUpAt, created_by: row.createdBy, updated_by: row.updatedBy,
    created_at: row.createdAt, updated_at: row.updatedAt
  };
}

function assertInserted(result, rows, table) {
  if (result.rowCount !== rows.length) throw safeError(`PROMOTION_${table.toUpperCase()}_COUNT_MISMATCH`);
}

async function assertHistoricalPostconditions(client, plan) {
  const cutoff = plan.historicalCutoffAt;
  const contacts = operationIds(plan, 'contact');
  if (contacts.length > 0) {
    const result = await client.query(
      `SELECT count(*)::integer AS count FROM contacts
       WHERE id=ANY($1::uuid[]) AND (
         created_at>=$2 OR updated_at>=$2 OR last_human_contact_at IS NOT NULL
       )`, [contacts, cutoff]
    );
    if (result.rows[0].count !== 0) throw safeError('PROMOTION_CONTACT_HISTORY_POSTCONDITION_FAILED');
  }
  for (const [type, table] of [
    ['membership', 'memberships'],
    ['membership_unit', 'membership_units'],
    ['task', 'tasks']
  ]) {
    const ids = operationIds(plan, type);
    if (!ids.length) continue;
    const result = await client.query(
      `SELECT count(*)::integer AS count FROM ${table}
       WHERE id=ANY($1::uuid[]) AND (created_at>=$2 OR updated_at>=$2)`, [ids, cutoff]
    );
    if (result.rows[0].count !== 0) {
      throw safeError(`PROMOTION_${table.toUpperCase()}_HISTORY_POSTCONDITION_FAILED`);
    }
  }
  const campaigns = operationIds(plan, 'campaign');
  if (campaigns.length > 0) {
    const result = await client.query(
      'SELECT count(*)::integer AS count FROM campaigns WHERE id=ANY($1::uuid[]) AND created_at>=$2',
      [campaigns, cutoff]
    );
    if (result.rows[0].count !== 0) {
      throw safeError('PROMOTION_CAMPAIGNS_HISTORY_POSTCONDITION_FAILED');
    }
  }
  const messages = operationIds(plan, 'campaign_message');
  if (messages.length > 0) {
    const result = await client.query(
      `SELECT count(*)::integer AS count FROM campaign_messages
       WHERE id=ANY($1::uuid[]) AND (created_at>=$2 OR sent_at>=$2)`, [messages, cutoff]
    );
    if (result.rows[0].count !== 0) {
      throw safeError('PROMOTION_CAMPAIGN_MESSAGE_HISTORY_POSTCONDITION_FAILED');
    }
  }
  const aliases = operationIds(plan, 'contact_alias');
  if (aliases.length > 0) {
    const result = await client.query(
      `SELECT count(*)::integer AS count FROM contact_aliases
       WHERE id=ANY($1::uuid[]) AND created_at>=$2`, [aliases, cutoff]
    );
    if (result.rows[0].count !== 0) {
      throw safeError('PROMOTION_CONTACT_ALIASES_HISTORY_POSTCONDITION_FAILED');
    }
  }
  const consents = operationIds(plan, 'contact_consent');
  if (consents.length > 0) {
    const result = await client.query(
      `SELECT count(*)::integer AS count FROM contact_consents
       WHERE id=ANY($1::uuid[]) AND (created_at>=$2 OR captured_at>=$2)`, [consents, cutoff]
    );
    if (result.rows[0].count !== 0) {
      throw safeError('PROMOTION_CONTACT_CONSENTS_HISTORY_POSTCONDITION_FAILED');
    }
  }
  const interactions = await client.query(
    `SELECT count(*)::integer AS count FROM interactions
     WHERE contact_id=ANY($1::uuid[])`, [contacts]
  );
  if (interactions.rows[0].count !== 0) {
    throw safeError('PROMOTION_CREATED_HUMAN_INTERACTION');
  }
}

function operationIds(plan, type) {
  return plan.operations.filter((operation) => operation.type === type)
    .map((operation) => operation.entityId);
}

async function assertPromotionDatabaseContract(client) {
  const tables = Object.keys(CONTRACT);
  const response = await client.query(
    `SELECT table_name,column_name FROM information_schema.columns
     WHERE table_schema=ANY(current_schemas(false)) AND table_name=ANY($1::text[])`, [tables]
  );
  const found = new Map();
  for (const row of response.rows) {
    const columns = found.get(row.table_name) ?? new Set();
    columns.add(row.column_name);
    found.set(row.table_name, columns);
  }
  for (const [table, columns] of Object.entries(CONTRACT)) {
    if (columns.some((column) => !found.get(table)?.has(column))) {
      throw safeError('PROMOTION_DATABASE_CONTRACT_MISMATCH');
    }
  }
}

async function assertPromotionAdmin(client, adminId) {
  const result = await client.query(
    "SELECT 1 FROM app_users WHERE id=$1 AND role='admin' AND active=true AND deleted_at IS NULL",
    [adminId]
  );
  if (result.rowCount !== 1) throw safeError('PROMOTION_ADMIN_NOT_ACTIVE');
}

function assertBatchMatchesPlan(batch, plan) {
  if (batch.configVersion !== plan.configVersion
    || batch.configSha256 !== plan.configSha256
    || batch.importerRelease !== plan.pipelineRelease
    || plan.pipelineRelease !== PROMOTION_PIPELINE_RELEASE) {
    throw safeError('PROMOTION_BATCH_PROVENANCE_MISMATCH');
  }
}

function assertExistingPromotion(row, authorization) {
  if (row.pipeline_release !== PROMOTION_PIPELINE_RELEASE
    || row.batch_importer_release !== row.pipeline_release
    || row.batch_config_version !== row.config_version
    || row.batch_config_sha256 !== row.config_sha256) {
    throw safeError('PROMOTION_EXISTING_PROVENANCE_MISMATCH');
  }
  assertPromotionExpectations({
    planSha256: row.plan_sha256,
    metrics: row.metrics
  }, authorization);
}

async function withClient({ client, databaseUrl, connectionConfig }, work) {
  if (client) return work(client);
  const pgModule = await import('pg');
  const Client = pgModule.Client ?? pgModule.default?.Client;
  if (!Client) throw safeError('POSTGRES_DRIVER_NOT_AVAILABLE');
  let config;
  if (connectionConfig) {
    if (connectionConfig.ssl?.rejectUnauthorized !== true) {
      throw safeError('PROMOTION_STRICT_TLS_REQUIRED');
    }
    config = { ...connectionConfig };
  } else {
    if (!databaseUrl) throw safeError('PROMOTION_DATABASE_CONNECTION_REQUIRED');
    config = { connectionString: databaseUrl, ssl: { rejectUnauthorized: true } };
  }
  const owned = new Client({ ...config, application_name: 'charros-crm-initial-promotion',
    connectionTimeoutMillis: 15_000, query_timeout: 600_000 });
  await owned.connect();
  try {
    return await work(owned);
  } finally {
    await owned.end().catch(() => {});
  }
}

function safeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
