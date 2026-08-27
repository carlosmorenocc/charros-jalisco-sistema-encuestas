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
          priced_memberships: 2, priced_seats: 3,
          membership_commercial_value: 4492000,
          membership_net_amount: 3748000, membership_discount_amount: 744000,
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
  const summary = await subject.dashboardSummary({ actor, filters });

  assert.match(calls[0].sql, /s\.season_code = \$1/);
  assert.match(calls[0].sql, /s\.effective_items AS items/);
  assert.equal(calls[0].params[0], 'LMP-2026-27');
  assert.match(calls[1].sql, /m\.season_code = \$3/);
  assert.match(calls[1].sql, /s\.season_code = \$3/);
  assert.equal(calls[1].params.at(-1), 'LMP-2026-27');
  assert.match(calls[1].sql, /membership_status IN \('active','renewing'\)/);
  assert.match(calls[1].sql, /s\.effective_sale_type='new'/);
  assert.match(calls[1].sql, /s\.effective_status IN \('confirmed','reserved'\)/);
  assert.match(calls[1].sql, /jsonb_array_elements\(s\.effective_items\)/);
  assert.match(calls[1].sql, /period_segment_vip/);
  assert.match(calls[1].sql, /LIKE '%planta baja%'/);
  assert.equal(summary.pricedMemberships, 2);
  assert.equal(summary.pricedSeats, 3);
  assert.equal(summary.membershipCommercialValue, 44920);
  assert.equal(summary.membershipNetAmount, 37480);
  assert.equal(summary.membershipDiscountAmount, 7440);
  assert.deepEqual(summary.periodMembershipSegments, {
    Compromisos: 0, VIP: 0, Preferente: 0, General: 0
  });
});

test('Dirección suma el total documentado de apartados y separa el cobro recibido', async () => {
  const pool = {
    async query() {
      return { rows: [{
        total_contacts: 1, current_subscribers: 1, renewing: 0,
        new_subscribers: 0, renewed_subscribers: 0, new_seats: 0, renewed_seats: 0,
        sold_new_subscribers: 1, sold_renewed_subscribers: 0,
        sold_new_seats: 1, sold_renewed_seats: 0,
        period_segment_commitments: 0, period_segment_vip: 1,
        period_segment_preferente: 0, period_segment_general: 0,
        not_contacted: 0, unassigned: 0, overdue_follow_ups: 0,
        active_seats: 0, human_interactions: 0, campaign_messages: 0,
        confirmed_sales: 1, sales_amount: 4207, collected_amount: 1500
      }] };
    }
  };
  const subject = new PgCrmRepository(pool, {
    tenantId: '00000000-0000-4000-8000-000000000001'
  });

  const summary = await subject.dashboardSummary({
    actor: { id: 'admin-id', role: 'admin' },
    filters: { season: 'LMP-2026-27' }
  });

  assert.equal(summary.newSubscribers, 1);
  assert.equal(summary.newSeats, 1);
  assert.equal(summary.activeSeats, 1);
  assert.deepEqual(summary.membershipSegments, {
    Compromisos: 0, VIP: 1, Preferente: 0, General: 0
  });
  assert.equal(summary.salesAmount, 4207);
  assert.equal(summary.collectedAmount, 1500);
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

test('listado y detalle proyectan una membresía LMP seleccionada sin consultas N+1', async () => {
  const calls = [];
  const row = {
    id: 'contact-id', first_name: 'Ana', last_name: 'López', email: 'ana@example.com',
    subscriber_status: 'current_subscriber', commercial_stage: 'contacted',
    consent_status: 'unknown', row_version: 3, total_count: 1,
    membership_id: 'membership-id', membership_status: 'active',
    membership_section: 'VIP', membership_seat_count: 2,
    membership_seats: ['A-1', 'A-2'], membership_row_version: 4,
    membership_price_book_version: 'LMP-2026-27-v1', membership_currency: 'MXN',
    membership_locality_code: 'vip', membership_locality_name: 'VIP',
    membership_discount_code: 'discount30', membership_discount_name: '30% de descuento',
    membership_pricing_mode: 'percentage', membership_list_unit_price: 2992000,
    membership_commercial_value: 5984000, membership_net_amount: 4188800,
    membership_discount_amount: 1795200, membership_effective_unit_price: 2094400,
    membership_charged_units: 2, membership_bonus_units: 0
  };
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [row] };
    }
  };
  const subject = new PgCrmRepository(pool);
  const actor = { id: 'admin-id', role: 'admin' };
  const listed = await subject.listContacts({
    actor,
    filters: { page: 1, pageSize: 25, sort: 'updatedAt', order: 'desc' }
  });
  const detail = await subject.getContact('contact-id', actor);

  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.sql.includes('LEFT JOIN LATERAL')));
  assert.ok(calls.every((call) => call.sql.includes("m.season_code='LMP-2026-27'")));
  assert.deepEqual(listed.items[0].membershipSeats, ['A-1', 'A-2']);
  assert.equal(listed.items[0].membershipSection, 'VIP');
  assert.equal(listed.items[0].membershipSeatCount, 2);
  assert.equal(listed.items[0].membershipRowVersion, 4);
  assert.equal(listed.items[0].membershipCommercialValue, 59840);
  assert.equal(listed.items[0].membershipNetAmount, 41888);
  assert.equal(listed.items[0].membershipLocalityCode, 'vip');
  assert.equal(detail.membershipId, 'membership-id');
});

test('exportación resuelve membresía en la consulta y serializa butacas legibles', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) return { rows: [], rowCount: 0 };
      if (normalized.startsWith('SELECT c.id')) {
        return {
          rows: [{
            id: 'contact-id', name: 'Ana López', membership_section: 'Preferente',
            membership_seat_count: 2, membership_seats: ['P-1', 'P-2'],
            membership_locality_name: 'Planta Baja Central',
            membership_discount_name: 'Julio 2026 - precio especial',
            membership_commercial_value: 3196000, membership_net_amount: 2397000,
            membership_discount_amount: 799000
          }],
          rowCount: 1
        };
      }
      if (normalized.startsWith('INSERT INTO audit_events')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${normalized}`);
    },
    release() {}
  };
  const subject = new PgCrmRepository({ async connect() { return client; } });
  const rows = await subject.exportContacts({
    actor: { id: 'admin-id', role: 'admin' },
    filters: {},
    context: { actorId: 'admin-id', requestId: 'request-id' }
  });

  const select = calls.find((call) => call.sql.startsWith('SELECT c.id'));
  assert.match(select.sql, /LEFT JOIN LATERAL/);
  assert.match(select.sql, /sm\.membership_section,sm\.membership_seat_count,sm\.membership_seats/);
  assert.equal(rows[0].membership_seats, 'P-1 | P-2');
  assert.equal(rows[0].membership_commercial_value, 31960);
  assert.equal(rows[0].membership_net_amount, 23970);
  assert.equal(calls.at(-1).sql, 'COMMIT');
});
