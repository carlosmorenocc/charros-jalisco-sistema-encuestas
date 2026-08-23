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
  const state = {
    loggedOut: false, pdfEvent: null, manualRegistration: null,
    membershipUpdate: null, membershipCreate: null
  };
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
    sessionAbsoluteTtlMs: 28_800_000,
    sessionHashKey: 'test-session-hash-0123456789abcdef0123456789abcdef'
  };
  const repository = {
    async ready() { return true; },
    async recordDashboardPdfExport(receivedActor, event) {
      state.pdfEvent = { actor: receivedActor, event };
    },
    async createManualRegistration(data, receivedActor, context, idempotency) {
      state.manualRegistration = { data, actor: receivedActor, context, idempotency };
      return {
        contact: { id: '00000000-0000-4000-8000-000000000020', rowVersion: 1 },
        membership: null,
        initialInteraction: { id: '00000000-0000-4000-8000-000000000021', isHumanContact: false },
        nextTask: null,
        replayed: false
      };
    },
    async updateMembership(id, data, receivedActor, context, expectedVersion) {
      state.membershipUpdate = { id, data, actor: receivedActor, context, expectedVersion };
      return {
        id, contactId: '00000000-0000-4000-8000-000000000020',
        seasonCode: 'LMP-2026-27', membershipStatus: 'active',
        ...data, rowVersion: expectedVersion + 1
      };
    },
    async createMembership(contactId, data, receivedActor, context) {
      state.membershipCreate = { contactId, data, actor: receivedActor, context };
      return {
        id: '00000000-0000-4000-8000-000000000030', contactId,
        ...data, rowVersion: 1
      };
    },
    async exportContacts() {
      return [{
        id: 'contact-1', name: 'Persona', membership_section: 'VIP',
        membership_seat_count: 2, membership_seats: 'A-1 | A-2'
      }];
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

test('rutas de usuarios no existen y las mutaciones contables validan su entrada', async () => {
  await withServer(async (baseUrl) => {
    for (const [method, path] of [
      ['GET', '/api/v1/users'],
      ['POST', '/api/v1/users'],
      ['PATCH', '/api/v1/users/00000000-0000-4000-8000-000000000010'],
      ['PUT', '/api/v1/users/00000000-0000-4000-8000-000000000010/permissions']
    ]) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        ...(method === 'GET' ? {} : { body: '{}' })
      });
      assert.equal(response.status, 404, `${method} ${path}`);
    }
    for (const path of ['/api/v1/sales', '/api/v1/sales/00000000-0000-4000-8000-000000000010/payments']) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST', headers: { ...authHeaders(), 'content-type': 'application/json' }, body: '{}'
      });
      assert.equal(response.status, 400, `POST ${path}`);
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

test('alta manual exige idempotencia y devuelve ETag hidratado', async () => {
  await withServer(async (baseUrl, state) => {
    const body = {
      contact: {
        firstName: 'Ana', lastName: 'López', email: 'ana@example.com',
        subscriberStatus: 'prospect', commercialStage: 'to_contact',
        businessSource: 'digital', declaredTenureSeasons: null
      },
      initialObservation: { notes: 'Alta desde CRM.' },
      membership: null
    };
    const missing = await fetch(`${baseUrl}/api/v1/manual-registrations`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    assert.equal(missing.status, 400);

    const response = await fetch(`${baseUrl}/api/v1/manual-registrations`, {
      method: 'POST',
      headers: {
        ...authHeaders(), 'content-type': 'application/json',
        'idempotency-key': '00000000-0000-4000-8000-000000000099'
      },
      body: JSON.stringify(body)
    });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('etag'), '"1"');
    assert.equal(response.headers.get('idempotency-replayed'), 'false');
    assert.equal((await response.json()).data.initialInteraction.isHumanContact, false);
    assert.equal(state.manualRegistration.data.contact.source, 'crm_manual');
    assert.match(state.manualRegistration.idempotency.requestHash, /^[0-9a-f]{64}$/);
  });
});

test('PATCH de abono exige CSRF, versión y devuelve ETag actualizado', async () => {
  await withServer(async (baseUrl, state) => {
    const id = '00000000-0000-4000-8000-000000000030';
    const body = {
      section: 'VIP', localityCode: 'vip', discountCode: 'regular', seatCount: 2,
      units: [
        { unitNumber: 1, seatIdentifier: 'A-1' },
        { unitNumber: 2, seatIdentifier: 'A-2' }
      ]
    };
    const missingCsrf = await fetch(`${baseUrl}/api/v1/memberships/${id}`, {
      method: 'PATCH',
      headers: { ...authHeaders({ csrf: false }), 'content-type': 'application/json', 'if-match': '1' },
      body: JSON.stringify(body)
    });
    assert.equal(missingCsrf.status, 403);

    const missingVersion = await fetch(`${baseUrl}/api/v1/memberships/${id}`, {
      method: 'PATCH', headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    assert.equal(missingVersion.status, 428);

    const invalid = await fetch(`${baseUrl}/api/v1/memberships/${id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'content-type': 'application/json', 'if-match': '1' },
      body: JSON.stringify({ ...body, section: 'Premier' })
    });
    assert.equal(invalid.status, 400);

    const response = await fetch(`${baseUrl}/api/v1/memberships/${id}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'content-type': 'application/json', 'if-match': '1' },
      body: JSON.stringify(body)
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('etag'), '"2"');
    assert.equal(state.membershipUpdate.expectedVersion, 1);
    assert.deepEqual(state.membershipUpdate.data, body);
  });
});

test('POST de abono devuelve ETag y exportación incluye sección, cantidad y butacas', async () => {
  await withServer(async (baseUrl, state) => {
    const contactId = '00000000-0000-4000-8000-000000000020';
    const membership = {
      seasonCode: 'LMP-2026-27', membershipStatus: 'active', section: 'General',
      localityCode: 'lateral_1_3', discountCode: 'regular',
      seatCount: 1, startDate: '2026-08-22',
      units: [{ unitNumber: 1, seatIdentifier: 'G-20' }]
    };
    const created = await fetch(`${baseUrl}/api/v1/contacts/${contactId}/memberships`, {
      method: 'POST', headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify(membership)
    });
    assert.equal(created.status, 201);
    assert.equal(created.headers.get('etag'), '"1"');
    assert.equal(state.membershipCreate.data.section, 'General');

    const exported = await fetch(`${baseUrl}/api/v1/exports/contacts.csv`, {
      headers: authHeaders({ csrf: false, origin: null })
    });
    assert.equal(exported.status, 200);
    const csv = await exported.text();
    assert.match(csv, /Sección,Cantidad de abonos,Butacas/);
    assert.match(csv, /VIP,2,A-1 \| A-2/);
  });
});
