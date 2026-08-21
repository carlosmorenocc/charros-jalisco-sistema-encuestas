import { randomUUID } from 'node:crypto';
import { buildStagingRecords } from './staging-records.js';

const REQUIRED_DATABASE_CONTRACT = Object.freeze({
  import_batches: [
    'id', 'source_name', 'source_sha256', 'status', 'total_rows', 'accepted_rows',
    'quarantined_rows', 'uploaded_by', 'completed_at'
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

export async function commitStagingImport(result, { databaseUrl, uploadedBy }) {
  const pgModule = await import('pg');
  const Client = pgModule.Client ?? pgModule.default?.Client;
  if (!Client) throw importError('POSTGRES_DRIVER_NOT_AVAILABLE');

  const client = new Client({
    connectionString: databaseUrl,
    application_name: 'charros-crm-staging-import',
    statement_timeout: 60_000,
    query_timeout: 60_000,
    connectionTimeoutMillis: 10_000
  });
  const batchId = randomUUID();
  const stagingRecords = buildStagingRecords(result);
  const quarantinedRows = stagingRecords.filter((record) => record.resolution === 'quarantined').length;
  const acceptedRows = stagingRecords.length - quarantinedRows;

  await client.connect();
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
        quarantined_rows, uploaded_by
      ) VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7)`,
      [
        batchId,
        `crm-workbook-${result.source.sha256.slice(0, 12)}.xlsx`,
        result.source.sha256,
        stagingRecords.length,
        acceptedRows,
        quarantinedRows,
        uploadedBy
      ]
    );

    for (const record of stagingRecords) {
      await client.query(
        `INSERT INTO source_records (
          id, import_batch_id, source_sheet, source_row_number, source_record_id,
          resolution, resolution_reason, normalized_fingerprint, raw_payload,
          normalized_payload, validation_errors
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)`,
        [
          record.id,
          batchId,
          record.sourceSheet,
          record.sourceRowNumber,
          record.sourceRecordId,
          record.resolution,
          record.resolutionReason,
          record.normalizedFingerprint,
          JSON.stringify(record.rawPayload),
          record.normalizedPayload ? JSON.stringify(record.normalizedPayload) : null,
          JSON.stringify(record.validationErrors)
        ]
      );
    }

    for (const candidate of result.mergeCandidates) {
      await client.query(
        `INSERT INTO import_match_candidates (
          id, import_batch_id, left_source_record_id, right_source_record_id,
          confidence, rule_codes, review_status
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'pending_review')`,
        [
          candidate.id,
          batchId,
          candidate.leftSourceRecordId,
          candidate.rightSourceRecordId,
          candidate.confidence,
          JSON.stringify(candidate.ruleCodes)
        ]
      );
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
    await client.end().catch(() => {});
  }
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
