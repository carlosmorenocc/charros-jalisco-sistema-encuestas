import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://example.invalid/db',
  AUDIT_HASH_KEY: 'audit-0123456789abcdef0123456789abcdef',
  SESSION_HASH_KEY: 'session-0123456789abcdef0123456789abcdef',
  PASSWORD_PEPPER: 'pepper-0123456789abcdef0123456789abcdef',
  CORS_ORIGINS: 'https://crm.example.test'
};

test('producción exige secretos distintos, HTTPS, CORS exacto y cookie Secure', () => {
  assert.throws(() => loadConfig({ ...production, CORS_ORIGINS: '*' }), /Wildcard/);
  assert.throws(() => loadConfig({ ...production, CORS_ORIGINS: 'http://crm.example.test' }), /HTTPS/);
  assert.throws(() => loadConfig({ ...production, CORS_ORIGINS: 'https://crm.example.test/path' }), /exact origin/);
  assert.throws(() => loadConfig({ ...production, SESSION_COOKIE_SECURE: 'false' }), /cannot be disabled/);
  assert.throws(() => loadConfig({ ...production, PASSWORD_PEPPER: production.SESSION_HASH_KEY }), /different secrets/);
  assert.throws(() => loadConfig({ ...production, AUDIT_HASH_KEY: 'short' }), /32/);
});

test('configura sesión host-only, TTL acotado y límites KDF seguros', () => {
  const config = loadConfig(production);
  assert.equal(config.sessionCookieName, '__Host-crm_session');
  assert.equal(config.csrfCookieName, '__Host-crm_csrf');
  assert.equal(config.sessionCookieSecure, true);
  assert.equal(config.sessionAbsoluteTtlMs, 8 * 60 * 60 * 1000);
  assert.equal(config.sessionIdleTtlMs, 45 * 60 * 1000);
  assert.equal(config.loginKdfConcurrency, 2);
  assert.equal(config.loginRateLimitMax, 5);
});

test('rechaza variables heredadas de Entra para evitar un despliegue ambiguo', () => {
  assert.throws(
    () => loadConfig({ ...production, ENTRA_TENANT_ID: '00000000-0000-0000-0000-000000000001' }),
    /no longer supported/
  );
});

test('pruebas pueden cargar configuración sin secretos reales', () => {
  const config = loadConfig({ NODE_ENV: 'test', CORS_ORIGINS: 'http://localhost:5173' });
  assert.equal(config.localAdminDomain, 'charrosjalisco.com');
  assert.equal(config.sessionCookieName, 'crm_session');
  assert.equal(config.sessionCookieSecure, false);
});
