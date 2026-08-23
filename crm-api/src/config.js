import 'dotenv/config';

function integer(value, fallback, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function boolean(value, fallback = false) {
  if (value === undefined) return fallback;
  if (!['true', 'false'].includes(String(value).toLowerCase())) throw new Error('Boolean value expected.');
  return String(value).toLowerCase() === 'true';
}

function required(value, name, { allowInTest = false, nodeEnv } = {}) {
  if (!value && !(allowInTest && nodeEnv === 'test')) throw new Error(`${name} is required.`);
  return value;
}

function exactOrigins(value, nodeEnv) {
  const values = String(value ?? '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (values.includes('*')) throw new Error('Wildcard CORS origins are forbidden.');
  for (const value of values) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`CORS origin is invalid: ${value}`);
    }
    if (parsed.origin !== value || parsed.username || parsed.password) {
      throw new Error(`CORS origin must be an exact origin without path: ${value}`);
    }
    if (nodeEnv === 'production' && parsed.protocol !== 'https:') {
      throw new Error('Production CORS origins must use HTTPS.');
    }
  }
  return values;
}

function secret(value, name, nodeEnv) {
  const resolved = required(value, name, { allowInTest: true, nodeEnv })
    ?? `test-only-${name.toLowerCase()}-0123456789abcdef`;
  if (nodeEnv === 'production' && resolved.length < 32) {
    throw new Error(`${name} must have at least 32 characters in production.`);
  }
  if (nodeEnv === 'production' && /replace|example|test-only/i.test(resolved)) {
    throw new Error(`${name} still contains an example or placeholder value.`);
  }
  return resolved;
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (env.AUTH_MODE || env.ENTRA_TENANT_ID || env.ENTRA_API_AUDIENCE) {
    throw new Error('Entra/AUTH_MODE configuration is no longer supported by this CRM deployment.');
  }

  const corsOrigins = exactOrigins(env.CORS_ORIGINS, nodeEnv);
  if (nodeEnv === 'production' && corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must contain the exact Vercel production origin.');
  }

  const localAdminDomain = (env.LOCAL_ADMIN_DOMAIN ?? 'charrosjalisco.com').trim().toLowerCase();
  if (localAdminDomain !== 'charrosjalisco.com') {
    throw new Error('LOCAL_ADMIN_DOMAIN must be charrosjalisco.com for this deployment.');
  }

  const auditHashKey = secret(env.AUDIT_HASH_KEY, 'AUDIT_HASH_KEY', nodeEnv);
  const sessionHashKey = secret(env.SESSION_HASH_KEY, 'SESSION_HASH_KEY', nodeEnv);
  const passwordPepper = secret(env.PASSWORD_PEPPER, 'PASSWORD_PEPPER', nodeEnv);
  if (nodeEnv === 'production' && new Set([auditHashKey, sessionHashKey, passwordPepper]).size !== 3) {
    throw new Error('AUDIT_HASH_KEY, SESSION_HASH_KEY and PASSWORD_PEPPER must be different secrets.');
  }

  const sessionAbsoluteTtlMs = integer(
    env.SESSION_ABSOLUTE_TTL_MS, 8 * 60 * 60 * 1000, 'SESSION_ABSOLUTE_TTL_MS',
    { min: 30 * 60 * 1000, max: 12 * 60 * 60 * 1000 }
  );
  const sessionIdleTtlMs = integer(
    env.SESSION_IDLE_TTL_MS, 45 * 60 * 1000, 'SESSION_IDLE_TTL_MS',
    { min: 10 * 60 * 1000, max: 60 * 60 * 1000 }
  );
  if (sessionIdleTtlMs >= sessionAbsoluteTtlMs) {
    throw new Error('SESSION_IDLE_TTL_MS must be shorter than SESSION_ABSOLUTE_TTL_MS.');
  }

  const sessionCookieSecure = boolean(env.SESSION_COOKIE_SECURE, nodeEnv === 'production');
  if (nodeEnv === 'production' && !sessionCookieSecure) {
    throw new Error('SESSION_COOKIE_SECURE cannot be disabled in production.');
  }

  return Object.freeze({
    nodeEnv,
    port: integer(env.PORT, 4100, 'PORT', { max: 65_535 }),
    trustProxy: integer(env.TRUST_PROXY, 1, 'TRUST_PROXY', { max: 10 }),
    logLevel: env.LOG_LEVEL ?? 'info',
    databaseUrl: required(env.DATABASE_URL, 'DATABASE_URL', { allowInTest: true, nodeEnv }),
    databaseSsl: boolean(env.DATABASE_SSL, nodeEnv === 'production'),
    dbPoolMax: integer(env.DB_POOL_MAX, 10, 'DB_POOL_MAX', { min: 1, max: 50 }),
    localAdminDomain,
    auditHashKey,
    sessionHashKey,
    passwordPepper,
    corsOrigins,
    sessionCookieName: nodeEnv === 'production' ? '__Host-crm_session' : 'crm_session',
    csrfCookieName: nodeEnv === 'production' ? '__Host-crm_csrf' : 'crm_csrf',
    sessionCookieSecure,
    sessionAbsoluteTtlMs,
    sessionIdleTtlMs,
    loginRateLimitWindowMs: integer(env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 'LOGIN_RATE_LIMIT_WINDOW_MS', { min: 60_000 }),
    loginRateLimitMax: integer(env.LOGIN_RATE_LIMIT_MAX, 5, 'LOGIN_RATE_LIMIT_MAX', { min: 3, max: 20 }),
    loginRateLimitBlockMs: integer(env.LOGIN_RATE_LIMIT_BLOCK_MS, 15 * 60 * 1000, 'LOGIN_RATE_LIMIT_BLOCK_MS', { min: 60_000 }),
    loginKdfConcurrency: integer(env.LOGIN_KDF_CONCURRENCY, 2, 'LOGIN_KDF_CONCURRENCY', { min: 1, max: 4 }),
    loginKdfQueueMax: integer(env.LOGIN_KDF_QUEUE_MAX, 8, 'LOGIN_KDF_QUEUE_MAX', { min: 0, max: 20 }),
    jsonBodyLimit: env.JSON_BODY_LIMIT ?? '1mb',
    rateLimitWindowMs: integer(env.RATE_LIMIT_WINDOW_MS, 60_000, 'RATE_LIMIT_WINDOW_MS', { min: 1_000 }),
    rateLimitMax: integer(env.RATE_LIMIT_MAX, 180, 'RATE_LIMIT_MAX', { min: 10 }),
    exportRowLimit: integer(env.EXPORT_ROW_LIMIT, 50_000, 'EXPORT_ROW_LIMIT', { min: 1, max: 100_000 })
  });
}
