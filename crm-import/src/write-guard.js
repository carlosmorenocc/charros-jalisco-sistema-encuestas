const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function validateWriteAuthorization({ commit, confirmSha, sourceSha }, env = process.env) {
  if (!commit) return { mode: 'dry-run' };
  if (env.CRM_IMPORT_ENVIRONMENT !== 'staging') {
    throw guardedError('WRITE_REQUIRES_STAGING_ENVIRONMENT');
  }
  if (env.CRM_IMPORT_ALLOW_WRITE !== 'true') {
    throw guardedError('WRITE_NOT_EXPLICITLY_ENABLED');
  }
  if (!SHA256_PATTERN.test(confirmSha ?? '') || confirmSha !== sourceSha) {
    throw guardedError('CONFIRMED_HASH_DOES_NOT_MATCH_SOURCE');
  }
  if (!nonEmpty(env.DATABASE_URL)) {
    throw guardedError('DATABASE_URL_REQUIRED');
  }
  if (!UUID_PATTERN.test(env.CRM_IMPORT_UPLOADED_BY ?? '')) {
    throw guardedError('VALID_UPLOADED_BY_UUID_REQUIRED');
  }
  return {
    mode: 'commit',
    uploadedBy: env.CRM_IMPORT_UPLOADED_BY
  };
}

function guardedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
