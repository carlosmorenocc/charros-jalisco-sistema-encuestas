import { randomUUID } from 'node:crypto';
import { buildStagingRecords } from './staging-records.js';
import { IMPORTER_NAME, IMPORTER_VERSION } from './constants.js';

const REQUIRED_DATABASE_CONTRACT = Object.freeze({
  import_batches: [
    'id', 'source_name', 'source_sha256', 'status', 'total_rows', 'accepted_rows',
    'quarantined_rows', 'uploaded_by', 'completed_at', 'config_version',
    'config_sha256', 'importer_release'
  ],
  source_records: [
    'id', 'import_batch_id', 'source_sheet', 'source_row_number', 'source_record_id',
    'resolution', 'resolution_reason', 'normalized_fingerprint', 'raw_payload',
    'normalized_payload', 'validation_errors'
  ],
  import_match_candidates: [
    'id', 'import_batch_id', 'left_source_record_id', 'right_source_record_id',
    'confidence', 'rule_codes', 'review_status'
  ]
});

export async function commitStagingImport(result, {
  databaseUrl,
  uploadedBy,
  client: suppliedClient,
  connectionConfig
}) {
  const pgModule = await import('pg');
  const Client = pgModule.Client ?? pgModule.default?.Client;
  if (!Client) throw importError('POSTGRES_DRIVER_NOT_AVAILABLE');

  const client = suppliedClient ?? new Client({
    ...(connectionConfig ?? { connectionString: databaseUrl, ssl: { rejectUnauthorized: true } }),
    application_name: 'charros-crm-staging-import',
    statement_timeout: 600_000,
    query_timeout: 600_000,
    connectionTimeoutMillis: 15_000
  });
  if (connectionConfig && connectionConfig.ssl?.rejectUnauthorized !== true) {
    throw importError('STRICT_TLS_REQUIRED');
  }
  const batchId = randomUUID();
  const stagingRecords = buildStagingRecords(result);
  const quarantinedRows = stagingRecords.filter((record) => record.resolution === 'quarantined').length;
  const acceptedRows = stagingRecords.length - quarantinedRows;

  if (!suppliedClient) await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['charros-crm-staging-import']);
    await assertDatabaseContract(client);
    await assertUploaderIsActive(client, uploadedBy);
    await assertSourceNotPreviouslyImported(client, result.source.sha256);

    await client.query(
      `INSERT INTO import_batches (
        id, source_name, source_sha256, status, total_rows, accepted_rows,
        quarantined_rows, uploaded_by, config_version, config_sha256, importer_release
      ) VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10)`,
      [
        batchId,
        `crm-workbook-${result.source.sha256.slice(0, 12)}.xlsx`,
        result.source.sha256,
        stagingRecords.length,
        acceptedRows,
        quarantinedRows,
        uploadedBy,
        result.configVersion,
        result.configSha256,
        `${IMPORTER_NAME}@${IMPORTER_VERSION}`
      ]
    );

    for (const records of chunks(stagingRecords, 500)) {
      const inserted = await client.query(
        `INSERT INTO source_records (
          id,import_batch_id,source_sheet,source_row_number,source_record_id,
          resolution,resolution_reason,normalized_fingerprint,raw_payload,
          normalized_payload,validation_errors)
         SELECT x.id,$1,x.source_sheet,x.source_row_number,x.source_record_id,
           x.resolution,x.resolution_reason,x.normalized_fingerprint,x.raw_payload,
           x.normalized_payload,x.validation_errors
         FROM jsonb_to_recordset($2::jsonb) AS x(
           id uuid,source_sheet text,source_row_number integer,source_record_id text,
           resolution text,resolution_reason text,normalized_fingerprint text,
           raw_payload jsonb,normalized_payload jsonb,validation_errors jsonb)`,
        [batchId, JSON.stringify(records.map(stagingRecordForDatabase))]
      );
      if (inserted.rowCount !== records.length) throw importError('STAGING_SOURCE_COUNT_MISMATCH');
    }

    for (const candidates of chunks(result.mergeCandidates, 500)) {
      const inserted = await client.query(
        `INSERT INTO import_match_candidates (
          id,import_batch_id,left_source_record_id,right_source_record_id,
          confidence,rule_codes,review_status)
         SELECT x.id,$1,x.left_source_record_id,x.right_source_record_id,
           x.confidence,x.rule_codes,'pending_review'
         FROM jsonb_to_recordset($2::jsonb) AS x(
           id uuid,left_source_record_id uuid,right_source_record_id uuid,
           confidence text,rule_codes jsonb)`,
        [batchId, JSON.stringify(candidates.map((candidate) => ({
          id: candidate.id,
          left_source_record_id: candidate.leftSourceRecordId,
          right_source_record_id: candidate.rightSourceRecordId,
          confidence: candidate.confidence,
          rule_codes: candidate.ruleCodes
        })))]
      );
      if (inserted.rowCount !== candidates.length) throw importError('STAGING_CANDIDATE_COUNT_MISMATCH');
    }

    await client.query(
      "UPDATE import_batches SET status = 'validated', completed_at = now() WHERE id = $1",
      [batchId]
    );
    await client.query('COMMIT');
    return {
      batchId,
      status: 'validated',
      insertedSourceRecords: stagingRecords.length,
      insertedMatchCandidates: result.mergeCandidates.length
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error?.code === '23505') throw importError('STAGING_BATCH_CONFLICT');
    if (KNOWN_SAFE_ERROR_CODES.has(error?.code)) throw error;
    throw importError('STAGING_TRANSACTION_FAILED');
  } finally {
    if (!suppliedClient) await client.end().catch(() => {});
  }
}

function stagingRecordForDatabase(record) {
  return {
    id: record.id,
    source_sheet: record.sourceSheet,
    source_row_number: record.sourceRowNumber,
    source_record_id: record.sourceRecordId,
    resolution: record.resolution,
    resolution_reason: record.resolutionReason,
    normalized_fingerprint: record.normalizedFingerprint,
    raw_payload: record.rawPayload,
    normalized_payload: record.normalizedPayload,
    validation_errors: record.validationErrors
  };
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

const KNOWN_SAFE_ERROR_CODES = new Set([
  'DATABASE_CONTRACT_MISMATCH',
  'UPLOADER_NOT_ACTIVE',
  'SOURCE_HASH_ALREADY_EXISTS'
]);

async function assertDatabaseContract(client) {
  const tables = Object.keys(REQUIRED_DATABASE_CONTRACT);
  const response = await client.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = ANY (current_schemas(false))
        AND table_name = ANY ($1::text[])`,
    [tables]
  );
  const available = new Map();
  for (const row of response.rows) {
    const columns = available.get(row.table_name) ?? new Set();
    columns.add(row.column_name);
    available.set(row.table_name, columns);
  }
  for (const [table, requiredColumns] of Object.entries(REQUIRED_DATABASE_CONTRACT)) {
    const columns = available.get(table) ?? new Set();
    if (requiredColumns.some((column) => !columns.has(column))) {
      const error = importError('DATABASE_CONTRACT_MISMATCH');
      error.code = 'DATABASE_CONTRACT_MISMATCH';
      throw error;
    }
  }
}

export async function assertUploaderIsActive(client, uploadedBy) {
  const response = await client.query(
    "SELECT 1 FROM app_users WHERE id = $1 AND active = true AND role = 'admin' AND deleted_at IS NULL",
    [uploadedBy]
  );
  if (response.rowCount !== 1) throw importError('UPLOADER_NOT_ACTIVE');
}

async function assertSourceNotPreviouslyImported(client, sourceSha256) {
  const response = await client.query(
    'SELECT 1 FROM import_batches WHERE source_sha256 = $1',
    [sourceSha256]
  );
  if (response.rowCount > 0) throw importError('SOURCE_HASH_ALREADY_EXISTS');
}

function importError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
