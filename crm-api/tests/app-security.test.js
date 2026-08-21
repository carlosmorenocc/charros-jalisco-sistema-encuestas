import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/logger.js';

const SESSION = 's'.repeat(43);
const CSRF = 'c'.repeat(43);
const ORIGIN = 'https://crm.example.test';

async function withServer(callback) {
  const actor = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'admin@charrosjalisco.com',
    displayName: 'Administrador CRM',
    role: 'admin',
    permissionGrants: []
  };
  const session = {
    id: '00000000-0000-4000-8000-000000000002',
    actor,
    csrfDigest: 'digest',
    expiresAt: '2026-08-22T00:00:00.000Z',
    idleExpiresAt: '2026-08-21T17:00:00.000Z'
  };
  const state = { loggedOut: false, pdfEvent: null };
  const config = {
    nodeEnv: 'production',
    logLevel: 'silent',
    trustProxy: 1,
    auditHashKey: 'test-key',
    corsOrigins: [ORIGIN],
    rateLimitWindowMs: 60_000,
    rateLimitMax: 100,
    jsonBodyLimit: '64kb',
    sessionCookieName: '__Host-crm_session',
    csrfCookieName: '__Host-crm_csrf',
    sessionCookieSecure: true,
    sessionAbsoluteTtlMs: 28_800_000
  };
  const repository = {
    async ready() { return true; },
    async recordDashboardPdfExport(receivedActor, event) {
      state.pdfEvent = { actor: receivedActor, event };
    }
  };
  const authService = {
    async login(credentials) {
      assert.equal(credentials.email, actor.email);
      assert.equal(credentials.password, 'not-logged');
      return {
        user: { ...actor, permissions: ['dashboard.read'] },
        sessionToken: SESSION,
        csrfToken: CSRF,
        expiresAt: session.expiresAt,
        idleExpiresAt: session.idleExpiresAt
      };
    },
    async authenticate(token) {
      if (token !== SESSION) {
        const error = new Error('invalid'); error.status = 401; error.code = 'UNAUTHORIZED'; throw error;
      }
      return session;
    },
    async refreshCsrf() { return CSRF; },
    verifyCsrf(receivedSession, header, cookie) {
      return receivedSession === session && header === CSRF && cookie === CSRF;
    },
    async logout() { state.loggedOut = true; }
  };
  const app = createApp({ config, repository, authService, logger: createLogger(config) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`, state);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function authHeaders({ csrf = true, origin = ORIGIN } = {}) {
  return {
    cookie: `__Host-crm_session=${SESSION}; __Host-crm_csrf=${CSRF}`,
    ...(origin ? { origin } : {}),
    ...(csrf ? { 'x-csrf-token': CSRF } : {})
  };
}

test('health es público/no-store y el API exige cookie de sesión', async () => {
  await withServer(async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('cache-control'), 'no-store');

    const anonymous = await fetch(`${baseUrl}/api/v1/me`);
    assert.equal(anonymous.status, 401);
    assert.equal((await anonymous.json()).error.code, 'UNAUTHORIZED');
  });
});

test('login de producción emite cookies host-only con flags exactos', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@charrosjalisco.com', password: 'not-logged' })
    });
    assert.equal(response.status, 200);
    const cookies = response.headers.get('set-cookie');
    assert.match(cookies, /__Host-crm_session=/);
    assert.match(cookies, /__Host-crm_csrf=/);
    assert.match(cookies, /HttpOnly/);
    assert.match(cookies, /Secure/);
    assert.match(cookies, /SameSite=Strict/);
    assert.match(cookies, /Path=\//);
    assert.doesNotMatch(cookies, /Domain=/i);
    assert.equal((await response.json()).data.csrfToken, CSRF);
  });
});

test('Origin y CSRF protegen mutaciones; sesión y logout funcionan con cookie', async () => {
  await withServer(async (baseUrl, state) => {
    const session = await fetch(`${baseUrl}/api/v1/auth/session`, { headers: authHeaders({ csrf: false, origin: null }) });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).data.user.role, 'admin');

    const missingCsrf = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST', headers: authHeaders({ csrf: false })
    });
    assert.equal(missingCsrf.status, 403);

    const wrongOrigin = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST', headers: authHeaders({ origin: 'https://evil.example' })
    });
    assert.equal(wrongOrigin.status, 403);

    const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST', headers: authHeaders()
    });
    assert.equal(logout.status, 204);
    assert.equal(state.loggedOut, true);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});

test('CORS exacto rechaza origen ajeno y permite el host Vercel configurado', async () => {
  await withServer(async (baseUrl) => {
    const forbidden = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { ...authHeaders({ csrf: false }), origin: 'https://malicious.example' }
    });
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json()).error.code, 'ORIGIN_NOT_ALLOWED');

    const allowed = await fetch(`${baseUrl}/api/v1/me`, { headers: authHeaders({ csrf: false }) });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), ORIGIN);
  });
});

test('rutas de usuarios y mutaciones contables no existen', async () => {
  await withServer(async (baseUrl) => {
    for (const [method, path] of [
      ['GET', '/api/v1/users'],
      ['POST', '/api/v1/users'],
      ['PATCH', '/api/v1/users/00000000-0000-4000-8000-000000000010'],
      ['PUT', '/api/v1/users/00000000-0000-4000-8000-000000000010/permissions'],
      ['POST', '/api/v1/sales'],
      ['POST', '/api/v1/sales/00000000-0000-4000-8000-000000000010/payments']
    ]) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        ...(method === 'GET' ? {} : { body: '{}' })
      });
      assert.equal(response.status, 404, `${method} ${path}`);
    }
  });
});

test('evento PDF acepta solo filtros minimizados y se audita antes de entregar', async () => {
  await withServer(async (baseUrl, state) => {
    const good = await fetch(`${baseUrl}/api/v1/exports/dashboard-pdf-events`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ filters: { season: 'LMP-2026-27' } })
    });
    assert.equal(good.status, 204);
    assert.deepEqual(state.pdfEvent.event, { filters: { season: 'LMP-2026-27' } });

    const pii = await fetch(`${baseUrl}/api/v1/exports/dashboard-pdf-events`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ filters: { executiveName: 'No debe guardarse' } })
    });
    assert.equal(pii.status, 400);
  });
});
