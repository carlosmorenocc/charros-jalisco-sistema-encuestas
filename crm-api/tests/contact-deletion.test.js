import test from 'node:test';
import assert from 'node:assert/strict';
import { PgCrmRepository } from '../src/repositories/PgCrmRepository.js';

test('eliminar contacto conserva ventas y audita la baja lógica con control de versión', async () => {
  const queries = [];
  const client = { query: async (sql, params) => {
    queries.push({ sql, params });
    return { rows: sql.startsWith('UPDATE contacts') ? [{ id: 'contact', deleted_at: new Date() }] : [] };
  }, release() {} };
  const repository = new PgCrmRepository({ connect: async () => client });
  repository.getContact = async (_id, _actor, options) => ({ id: 'contact', deletedAt: options.includeDeleted ? 'deleted' : null });
  let audit;
  repository.audit = async (_client, _context, event) => { audit = event; };
  const result = await repository.softDeleteContact('contact', 'Canceló renovación', { id: 'admin' }, {}, 3);
  assert.equal(result.deletedAt, 'deleted');
  const update = queries.find(({ sql }) => sql.startsWith('UPDATE contacts'));
  assert.match(update.sql, /deleted_at = now\(\)/);
  assert.match(update.sql, /row_version = \$4/);
  assert.deepEqual(update.params, ['admin', 'Canceló renovación', 'contact', 3]);
  assert.equal(audit.action, 'contact.deleted');
  assert.equal(audit.metadata.reason, 'Canceló renovación');
  assert.equal(queries.some(({ sql }) => /DELETE FROM|UPDATE sales|UPDATE sale_holder/.test(sql)), false);
  assert.equal(queries.at(-1).sql, 'COMMIT');
});

test('los indicadores de cartera excluyen contactos eliminados', async () => {
  let query;
  const repository = new PgCrmRepository({ query: async (sql) => { query = sql; return { rows: [{}] }; } });
  await repository.dashboardSummary({ actor: { id: 'admin', role: 'admin' }, filters: {} });
  assert.match(query, /WITH scoped_contacts AS/);
  assert.match(query, /WHERE c\.deleted_at IS NULL/);
  assert.match(query, /subscriber_status = 'renewing'/);
});
