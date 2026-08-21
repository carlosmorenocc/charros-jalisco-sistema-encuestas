import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate, csrfProtection } from '../src/middleware/authenticate.js';

const SESSION = 's'.repeat(43);
const CSRF = 'c'.repeat(43);
const actor = { id: 'user-1', role: 'admin' };

function request({ cookie, origin, csrf, method = 'GET' } = {}) {
  const headers = { cookie, origin, 'x-csrf-token': csrf };
  return {
    method,
    get(name) { return headers[name.toLowerCase()]; }
  };
}

test('autentica solo una cookie de sesión opaca válida y adjunta el Admin', async () => {
  const middleware = authenticate({
    cookieName: 'crm_session',
    authService: {
      async authenticate(token) {
        assert.equal(token, SESSION);
        return { id: 'session-1', actor, csrfDigest: 'digest' };
      }
    }
  });
  const req = request({ cookie: `crm_session=${SESSION}` });
  const error = await new Promise((resolve) => middleware(req, {}, resolve));
  assert.equal(error, undefined);
  assert.equal(req.actor, actor);
  assert.equal(req.authSessionToken, SESSION);
});

test('rechaza cookie ausente o duplicada sin aceptar Bearer', async () => {
  const middleware = authenticate({
    cookieName: 'crm_session',
    authService: { async authenticate() { throw new Error('must not be called'); } }
  });
  for (const cookie of [undefined, `crm_session=${SESSION}; crm_session=${SESSION}`]) {
    const error = await new Promise((resolve) => middleware(request({ cookie }), {}, resolve));
    assert.equal(error.status, 401);
  }
});

test('CSRF exige método inseguro, Origin exacto, header y cookie coincidentes', async () => {
  const config = {
    corsOrigins: ['https://crm.example.test'],
    csrfCookieName: 'crm_csrf'
  };
  const authService = {
    verifyCsrf(session, header, cookie) {
      return session.actor === actor && header === CSRF && cookie === CSRF;
    }
  };
  const middleware = csrfProtection({ authService, config });
  const session = { actor };

  const safe = request({ method: 'GET' });
  safe.authSession = session;
  assert.equal(await new Promise((resolve) => middleware(safe, {}, resolve)), undefined);

  const good = request({
    method: 'POST', origin: 'https://crm.example.test', csrf: CSRF,
    cookie: `crm_csrf=${CSRF}`
  });
  good.authSession = session;
  assert.equal(await new Promise((resolve) => middleware(good, {}, resolve)), undefined);

  for (const bad of [
    request({ method: 'POST', origin: 'https://evil.example', csrf: CSRF, cookie: `crm_csrf=${CSRF}` }),
    request({ method: 'POST', origin: 'https://crm.example.test', csrf: 'x', cookie: `crm_csrf=${CSRF}` }),
    request({ method: 'POST', origin: 'https://crm.example.test', csrf: CSRF })
  ]) {
    bad.authSession = session;
    const error = await new Promise((resolve) => middleware(bad, {}, resolve));
    assert.equal(error.status, 403);
  }
});
