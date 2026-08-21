import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearStartupAdminSecrets,
  ensureStartupAdmin
} from '../src/security/startupAdminBootstrap.js';

const ENV = Object.freeze({
  BOOTSTRAP_ADMIN_EMAIL: 'admin@charrosjalisco.com',
  BOOTSTRAP_ADMIN_NAME: 'Administrador CRM',
  BOOTSTRAP_ADMIN_PASSWORD: 'Strong-Password-2026!'
});
const CONFIG = Object.freeze({
  localAdminDomain: 'charrosjalisco.com',
  passwordPepper: 'pepper-not-used-by-the-test'
});

function fakePool({ users = [], credentialCount = 0 } = {}) {
  const queries = [];
  const client = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (/SELECT u\.id,u\.email,u\.role/.test(sql)) {
        return { rowCount: users.length, rows: users };
      }
      if (/SELECT count\(\*\).*FROM local_credentials/.test(sql)) {
        return { rowCount: 1, rows: [{ count: credentialCount }] };
      }
      if (/INSERT INTO app_users/.test(sql)) {
        return { rowCount: 1, rows: [{ id: 'admin-id' }] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {}
  };
  return {
    queries,
    pool: { async connect() { return client; } }
  };
}

test('is disabled only when no bootstrap variable is present', async () => {
  const { pool, queries } = fakePool();
  assert.deepEqual(await ensureStartupAdmin({ pool, config: CONFIG, env: {} }), { status: 'disabled' });
  assert.equal(queries.length, 0);
});

test('removes every bootstrap secret before the long-lived API starts', () => {
  const env = { ...ENV, UNRELATED: 'preserved' };
  clearStartupAdminSecrets(env);
  assert.deepEqual(env, { UNRELATED: 'preserved' });
});

test('fails closed when bootstrap environment is partial or blank', async () => {
  const { pool, queries } = fakePool();
  await assert.rejects(
    ensureStartupAdmin({
      pool,
      config: CONFIG,
      env: { BOOTSTRAP_ADMIN_EMAIL: ENV.BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME: '' }
    }),
    /bootstrap is incomplete/
  );
  assert.equal(queries.length, 0);
});

test('creates an Admin only from the zero-user and zero-credential state', async () => {
  const { pool, queries } = fakePool();
  let hashedValue;
  const result = await ensureStartupAdmin({
    pool,
    config: CONFIG,
    env: ENV,
    hashPasswordFn: async (password) => {
      hashedValue = password;
      return 'encoded-password-hash';
    },
    randomUUID: () => '00000000-0000-4000-8000-000000000001'
  });

  assert.deepEqual(result, { status: 'created' });
  assert.equal(hashedValue, ENV.BOOTSTRAP_ADMIN_PASSWORD);
  assert.ok(queries.some(({ sql }) => /INSERT INTO app_users/.test(sql)));
  assert.ok(queries.some(({ sql }) => /INSERT INTO local_credentials/.test(sql)));
  assert.ok(queries.some(({ sql }) => /auth\.admin_bootstrapped/.test(sql)));
  assert.equal(
    queries.some(({ values }) => values.includes(ENV.BOOTSTRAP_ADMIN_PASSWORD)),
    false,
    'the raw password must never be sent to PostgreSQL'
  );
});

test('a cold restart leaves the matching Admin and password unchanged', async () => {
  const { pool, queries } = fakePool({
    users: [{
      id: 'admin-id',
      email: ENV.BOOTSTRAP_ADMIN_EMAIL,
      role: 'admin',
      active: true,
      has_credentials: true
    }]
  });
  let hashCalls = 0;
  const result = await ensureStartupAdmin({
    pool,
    config: CONFIG,
    env: ENV,
    hashPasswordFn: async () => { hashCalls += 1; throw new Error('must not hash'); }
  });

  assert.deepEqual(result, { status: 'already_exists' });
  assert.equal(hashCalls, 0);
  assert.equal(queries.some(({ sql }) => /UPDATE local_credentials/.test(sql)), false);
  assert.equal(queries.some(({ sql }) => /INSERT INTO/.test(sql)), false);
});

test('refuses a different, disabled, incomplete, or multiple-user state', async () => {
  const unsafeStates = [
    [{ email: 'other@charrosjalisco.com', role: 'admin', active: true, has_credentials: true }],
    [{ email: ENV.BOOTSTRAP_ADMIN_EMAIL, role: 'admin', active: false, has_credentials: true }],
    [{ email: ENV.BOOTSTRAP_ADMIN_EMAIL, role: 'admin', active: true, has_credentials: false }],
    [
      { email: ENV.BOOTSTRAP_ADMIN_EMAIL, role: 'admin', active: true, has_credentials: true },
      { email: 'other@charrosjalisco.com', role: 'executive', active: true, has_credentials: false }
    ]
  ];
  for (const users of unsafeStates) {
    const { pool } = fakePool({ users });
    await assert.rejects(
      ensureStartupAdmin({ pool, config: CONFIG, env: ENV }),
      /not the expected single-Admin state/
    );
  }
});

test('refuses orphaned credential state instead of overwriting it', async () => {
  const { pool } = fakePool({ credentialCount: 1 });
  await assert.rejects(
    ensureStartupAdmin({ pool, config: CONFIG, env: ENV }),
    /credential state exists without an active user/
  );
});
