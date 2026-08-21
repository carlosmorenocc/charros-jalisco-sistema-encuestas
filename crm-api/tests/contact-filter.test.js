import test from 'node:test';
import assert from 'node:assert/strict';
import { PgCrmRepository } from '../src/repositories/PgCrmRepository.js';

const repository = new PgCrmRepository({}, {
  tenantId: '00000000-0000-4000-8000-000000000001'
});

test('separa prospectos y cartera desde PostgreSQL antes de paginar', () => {
  const actor = { id: 'admin-id', role: 'admin' };
  const prospects = repository.buildContactFilter({ segment: 'prospect' }, actor);
  const portfolio = repository.buildContactFilter({ segment: 'portfolio' }, actor);

  assert.match(prospects.where, /subscriber_status = 'prospect'/);
  assert.match(portfolio.where, /subscriber_status <> 'prospect'/);
  assert.deepEqual(prospects.params, []);
  assert.deepEqual(portfolio.params, []);
});

test('filtra asignación y fechas con una lista segura de columnas', () => {
  const actor = { id: 'admin-id', role: 'admin' };
  const filter = repository.buildContactFilter({
    assignment: 'unassigned',
    dateField: 'lastContact',
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-31T23:59:59.999Z'
  }, actor);

  assert.match(filter.where, /executive_id IS NULL/);
  assert.match(filter.where, /last_human_contact_at >= \$1/);
  assert.match(filter.where, /last_human_contact_at <= \$2/);
  assert.deepEqual(filter.params, [
    '2026-08-01T00:00:00.000Z',
    '2026-08-31T23:59:59.999Z'
  ]);
});

test('filtra por el canal real de la última interacción humana', () => {
  const actor = { id: 'admin-id', role: 'admin' };
  const filter = repository.buildContactFilter({ lastChannel: 'whatsapp' }, actor);

  assert.match(filter.where, /s\.last_human_contact_channel = \$1/);
  assert.deepEqual(filter.params, ['whatsapp']);
});

test('la búsqueda admite nombre completo sin concatenar SQL del usuario', () => {
  const actor = { id: 'admin-id', role: 'admin' };
  const filter = repository.buildContactFilter({ search: 'Ana López' }, actor);

  assert.match(filter.where, /concat_ws\(' ',c\.first_name,c\.last_name\) ILIKE \$1/);
  assert.match(filter.where, /c\.external_ref ILIKE \$1/);
  assert.match(filter.where, /c\.id::text ILIKE \$1/);
  assert.match(filter.where, /c\.summary_notes ILIKE \$1/);
  assert.deepEqual(filter.params, ['%Ana López%']);
});

test('aplica el canal de última interacción al resumen sin interpolar valores', async () => {
  let call;
  const pool = {
    async query(sql, params) {
      call = { sql, params };
      return { rows: [{
        total_contacts: 0, current_subscribers: 0, renewing: 0,
        new_subscribers: 0, not_contacted: 0, unassigned: 0,
        overdue_follow_ups: 0, active_seats: 0, human_interactions: 0,
        campaign_messages: 0, confirmed_sales: 0, sales_amount: 0,
        collected_amount: 0
      }] };
    }
  };
  const subject = new PgCrmRepository(pool, {
    tenantId: '00000000-0000-4000-8000-000000000001'
  });

  await subject.dashboardSummary({
    actor: { id: 'admin-id', role: 'admin' },
    filters: { lastChannel: 'email' }
  });

  assert.match(call.sql, /LEFT JOIN contact_operational_summary s ON s\.id = c\.id/);
  assert.match(call.sql, /s\.last_human_contact_channel = \$1/);
  assert.deepEqual(call.params, ['email', null, null, null]);
});

test('la vista de eliminados no mezcla contactos activos', () => {
  const actor = { id: 'admin-id', role: 'admin' };
  const deleted = repository.buildContactFilter({ deletedOnly: true }, actor);
  assert.match(deleted.where, /c\.deleted_at IS NOT NULL/);
  assert.doesNotMatch(deleted.where, /c\.deleted_at IS NULL/);
});

test('aplica temporada en ventas y dashboard con parámetros SQL', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('WITH scoped_contacts')) {
        return { rows: [{
          total_contacts: 0, current_subscribers: 0, renewing: 0,
          new_subscribers: 0, not_contacted: 0, unassigned: 0,
          overdue_follow_ups: 0, active_seats: 0, human_interactions: 0,
          campaign_messages: 0, confirmed_sales: 0, sales_amount: 0,
          collected_amount: 0
        }] };
      }
      return { rows: [] };
    }
  };
  const subject = new PgCrmRepository(pool, {
    tenantId: '00000000-0000-4000-8000-000000000001'
  });
  const actor = { id: 'admin-id', role: 'admin' };
  const filters = {
    page: 1, pageSize: 25, sort: 'updatedAt', order: 'desc',
    season: 'LMP-2026-27'
  };

  await subject.listSales({ actor, filters });
  await subject.dashboardSummary({ actor, filters });

  assert.match(calls[0].sql, /s\.season_code = \$1/);
  assert.match(calls[0].sql, /COALESCE\(i\.items,'\[\]'::jsonb\) AS items/);
  assert.equal(calls[0].params[0], 'LMP-2026-27');
  assert.match(calls[1].sql, /m\.season_code = \$3/);
  assert.match(calls[1].sql, /s\.season_code = \$3/);
  assert.equal(calls[1].params.at(-1), 'LMP-2026-27');
});

test('bitácora global y tareas abiertas conservan el alcance del ejecutivo', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [] };
    }
  };
  const subject = new PgCrmRepository(pool, {
    tenantId: '00000000-0000-4000-8000-000000000001'
  });
  const actor = { id: 'executive-id', role: 'executive' };
  const filters = {
    page: 1, pageSize: 25, sort: 'dueAt', order: 'asc', taskState: 'open'
  };

  await subject.listAllInteractions({ actor, filters });
  await subject.listTasks({ actor, filters });
  await subject.getTask('task-id', actor);

  assert.match(calls[0].sql, /c\.executive_id = \$1/);
  assert.match(calls[1].sql, /t\.assigned_to = \$1/);
  assert.match(calls[1].sql, /c\.executive_id = \$1/);
  assert.match(calls[1].sql, /c\.deleted_at IS NULL/);
  assert.match(calls[1].sql, /t\.status IN \('pending','in_progress'\)/);
  assert.match(calls[2].sql, /t\.assigned_to=\$2/);
  assert.match(calls[2].sql, /c\.executive_id=\$2/);
  assert.match(calls[2].sql, /c\.deleted_at IS NULL/);
});
