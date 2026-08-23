import test from 'node:test';
import assert from 'node:assert/strict';
import { PgCrmRepository } from '../src/repositories/PgCrmRepository.js';

test('audita el login sin reutilizar un parámetro UUID como texto', async () => {
  let call;
  const pool = {
    async query(sql, params) {
      call = { sql, params };
      return { rows: [] };
    }
  };
  const repository = new PgCrmRepository(pool);
  const userId = '3624e781-3bee-4305-ba06-8d245ac7c11f';
  const requestId = '00000000-0000-4000-8000-000000000001';

  await repository.recordAuthEvent(userId, {
    requestId,
    ipHash: 'a'.repeat(64),
    userAgent: 'crm-test'
  }, 'auth.login_succeeded');

  assert.match(call.sql, /VALUES \(\$1,\$2,'auth',\$3,\$4/);
  assert.deepEqual(call.params, [
    userId,
    'auth.login_succeeded',
    userId,
    requestId,
    'a'.repeat(64),
    'crm-test'
  ]);
});
