import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalAuthService } from '../src/security/LocalAuthService.js';
import { hashPassword, verifyPassword, SCRYPT_PARAMETERS } from '../src/security/password.js';

const PASSWORD = 'Prueba-Segura-2026!';
const PEPPER = 'test-pepper-0123456789abcdef0123456789abcdef';
const HASH = await hashPassword(PASSWORD, PEPPER);

const config = {
  sessionHashKey: 'test-session-0123456789abcdef0123456789abcdef',
  passwordPepper: PEPPER,
  localAdminDomain: 'charrosjalisco.com',
  loginRateLimitWindowMs: 900_000,
  loginRateLimitMax: 5,
  loginRateLimitBlockMs: 900_000,
  loginKdfConcurrency: 2,
  loginKdfQueueMax: 8,
  sessionAbsoluteTtlMs: 28_800_000,
  sessionIdleTtlMs: 2_700_000
};

const candidate = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@charrosjalisco.com',
  displayName: 'Administrador CRM',
  role: 'admin',
  permissionGrants: [],
  passwordHash: HASH,
};

function fakeRepository(overrides = {}) {
  const state = { success: 0, sessions: [], events: [], throttleCleared: 0 };
  return {
    state,
    async consumeLoginIpAttempt() { return { allowed: true }; },
    async findLocalAdminForLogin() { return candidate; },
    async recordLocalLoginSuccess() { state.success += 1; },
    async createAuthSession(data) {
      state.sessions.push(data);
      return { id: 'session-id', expiresAt: data.expiresAt, idleExpiresAt: data.idleExpiresAt };
    },
    async recordAuthEvent(_id, _context, action) { state.events.push(action); },
    async clearLoginIpThrottle() { state.throttleCleared += 1; },
    async findActiveAuthSession() { return null; },
    async rotateAuthSessionCsrf() { return true; },
    async revokeAuthSession() {},
    ...overrides
  };
}

test('scrypt usa perfil OWASP acotado y verifica hash, error y usuario inexistente', async () => {
  assert.deepEqual(
    { N: SCRYPT_PARAMETERS.N, r: SCRYPT_PARAMETERS.r, p: SCRYPT_PARAMETERS.p },
    { N: 32_768, r: 8, p: 3 }
  );
  assert.equal(await verifyPassword(PASSWORD, HASH, PEPPER), true);
  assert.equal(await verifyPassword('Incorrecta-Segura-2026!', HASH, PEPPER), false);
  assert.equal(await verifyPassword(PASSWORD, null, PEPPER), false);
  assert.doesNotMatch(HASH, new RegExp(PASSWORD));
});

test('login crea tokens opacos y persiste únicamente HMAC, sin contraseña', async () => {
  const repository = fakeRepository();
  const auth = new LocalAuthService(repository, config);
  const result = await auth.login({ email: candidate.email, password: PASSWORD }, {
    requestId: '00000000-0000-4000-8000-000000000010',
    ipHash: 'a'.repeat(64), userAgent: 'test-agent'
  });
  assert.match(result.sessionToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(result.csrfToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(repository.state.sessions.length, 1);
  assert.match(repository.state.sessions[0].tokenDigest, /^[0-9a-f]{64}$/);
  assert.match(repository.state.sessions[0].csrfDigest, /^[0-9a-f]{64}$/);
  assert.notEqual(repository.state.sessions[0].tokenDigest, result.sessionToken);
  assert.doesNotMatch(JSON.stringify(repository.state.sessions[0]), /Prueba-Segura/);
  assert.deepEqual(repository.state.events, ['auth.login_succeeded']);
  assert.equal(repository.state.throttleCleared, 1);
  assert.equal(result.user.role, 'admin');
});

test('credencial incorrecta es genérica y no crea sesión', async () => {
  const repository = fakeRepository();
  const auth = new LocalAuthService(repository, config);
  await assert.rejects(
    auth.login({ email: candidate.email, password: 'Incorrecta-Segura-2026!' }, { ipHash: 'b'.repeat(64) }),
    (error) => error.status === 401 && !error.message.includes(candidate.email)
  );
  assert.equal(repository.state.sessions.length, 0);
});

test('límite persistente corta fuerza bruta antes del KDF', async () => {
  const repository = fakeRepository({
    async consumeLoginIpAttempt() { return { allowed: false }; },
    async findLocalAdminForLogin() { throw new Error('must not be called'); }
  });
  const auth = new LocalAuthService(repository, config);
  await assert.rejects(
    auth.login({ email: candidate.email, password: PASSWORD }, { ipHash: 'c'.repeat(64) }),
    (error) => error.status === 429 && error.code === 'LOGIN_RATE_LIMITED'
  );
});

test('sesión exige token de 32 bytes y CSRF compara header, cookie y digest', async () => {
  const rawSession = 's'.repeat(43);
  const rawCsrf = 'c'.repeat(43);
  let expectedDigest;
  const repository = fakeRepository({
    async findActiveAuthSession(tokenDigest) {
      expectedDigest = tokenDigest;
      return {
        id: 'session-id', actor: candidate,
        csrfDigest: auth.digest(rawCsrf),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        idleExpiresAt: new Date(Date.now() + 30_000).toISOString()
      };
    }
  });
  const auth = new LocalAuthService(repository, config);
  const session = await auth.authenticate(rawSession);
  assert.equal(expectedDigest, auth.digest(rawSession));
  assert.equal(auth.verifyCsrf(session, rawCsrf, rawCsrf), true);
  assert.equal(auth.verifyCsrf(session, rawCsrf, 'x'.repeat(43)), false);
  await assert.rejects(auth.authenticate('short'), /Autenticación|Autenticaci/);
});
