import test from 'node:test';
import assert from 'node:assert/strict';
import { PgCrmRepository } from '../src/repositories/PgCrmRepository.js';

test('ventas desempata por ID para no repetir ni omitir órdenes entre páginas', async () => {
  let query;
  const repository = new PgCrmRepository({ query: async (sql) => {
    query = sql;
    return { rows: [] };
  } });
  await repository.listSales({ actor: { id: 'admin', role: 'admin' },
    filters: { page: 1, pageSize: 100, season: 'LMP-2026-27' } });
  assert.match(query, /ORDER BY s\.effective_sold_at DESC NULLS LAST,s\.created_at DESC,s\.id DESC/);
});
