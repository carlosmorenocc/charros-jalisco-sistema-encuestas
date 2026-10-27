import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

const baseEnvironment = {
  NODE_ENV:'production',
  DATABASE_URL:'postgres://rewards:test@localhost/rewards',
  DATABASE_SSL:'false',
  SESSION_COOKIE_SECURE:'true',
  SESSION_COOKIE_SAME_SITE:'none',
  SESSION_HASH_KEY:'session-key-for-tests-with-32-characters',
  PASSWORD_PEPPER:'password-pepper-for-tests-32-characters',
  AUDIT_HASH_KEY:'audit-key-for-tests-with-at-least-32-characters',
};

function withEnvironment(values,run) {
  const previous = { ...process.env };
  try {
    Object.assign(process.env,baseEnvironment,values);
    delete process.env.CORS_ORIGIN;
    return run();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env,previous);
  }
}

test('acepta una lista cerrada de orígenes CORS y elimina duplicados', () => {
  withEnvironment({
    CORS_ORIGINS:'https://rewards.example, https://preview.example/,https://rewards.example',
  },() => {
    const config = loadConfig();
    assert.deepEqual(config.corsOrigins,['https://rewards.example','https://preview.example']);
  });
});

test('rechaza comodines, rutas y orígenes no HTTPS en producción', () => {
  withEnvironment({ CORS_ORIGINS:'https://rewards.example/path' },() => {
    assert.throws(() => loadConfig(),/exact HTTP\(S\) origins/);
  });
  withEnvironment({ CORS_ORIGINS:'*' },() => {
    assert.throws(() => loadConfig(),/Invalid CORS origin/);
  });
  withEnvironment({ CORS_ORIGINS:'http://rewards.example' },() => {
    assert.throws(() => loadConfig(),/HTTPS CORS origin/);
  });
});
