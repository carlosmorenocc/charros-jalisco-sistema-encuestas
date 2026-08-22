import test from 'node:test';
import assert from 'node:assert/strict';
import { PgCrmRepository } from '../src/repositories/PgCrmRepository.js';

const IDS = Object.freeze({
  actor: '00000000-0000-4000-8000-000000000001',
  contact: '00000000-0000-4000-8000-000000000010',
  membership: '00000000-0000-4000-8000-000000000011',
  interaction: '00000000-0000-4000-8000-000000000012',
  task: '00000000-0000-4000-8000-000000000013',
  key: '00000000-0000-4000-8000-000000000014'
});

const actor = {
  id: IDS.actor, email: 'admin@charrosjalisco.com', displayName: 'Administrador CRM',
  role: 'admin', permissionGrants: []
};

const registration = {
  contact: {
    firstName: 'Ana', lastName: 'López', email: 'ana@example.com', phone: null,
    municipality: 'Guadalajara', subscriberStatus: 'current_subscriber',
    commercialStage: 'contacted', preferredChannel: 'phone', executiveId: null,
    source: 'crm_manual', acquisitionSource: 'referral', declaredTenureSeasons: 2
  },
  consent: {
    status: 'yes', purpose: 'marketing', source: 'crm_manual', privacyNoticeVersion: '2026-08-01'
  },
  initialObservation: { notes: 'Registro inicial.' },
  membership: {
    seasonCode: 'LMP-2026-27', membershipStatus: 'active', seatCount: 2,
    startDate: '2026-08-21T00:00:00.000Z', renewalDate: null,
    units: [{ unitNumber: 1, jerseySize: 'M' }, { unitNumber: 2, jerseySize: null }]
  },
  nextTask: {
    assignedTo: IDS.actor, description: 'Llamar mañana',
    dueAt: '2026-08-22T18:00:00.000Z', priority: 'normal', status: 'pending'
  }
};

function result(rows = []) {
  return { rows, rowCount: rows.length };
}

class FakePool {
  constructor(options = {}) {
    this.options = options;
    this.state = {
      commands: [], prior: null, contactsInserted: 0, unitsInserted: 0,
      auditsInserted: 0, idempotencyInserted: 0
    };
    this.client = {
      query: (text, params = []) => this.query(text, params),
      release() {}
    };
  }

  async connect() { return this.client; }

  async query(text, params = []) {
    const sql = String(text).replace(/\s+/g, ' ').trim();
    this.state.commands.push(sql);
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return result();
    if (sql.includes('pg_advisory_xact_lock')) return result([{}]);
    if (sql.includes('FROM manual_registration_requests WHERE idempotency_key')) {
      return result(this.state.prior ? [this.state.prior] : []);
    }
    if (sql.startsWith('SELECT id,role FROM app_users')) {
      return result([{ id: params[0], role: params[0] === IDS.actor ? 'admin' : 'executive' }]);
    }
    if (sql.startsWith('SELECT c.id,c.deleted_at FROM contacts c')) {
      return result(this.options.duplicates ?? []);
    }
    if (sql.startsWith('INSERT INTO contacts')) {
      this.state.contactsInserted += 1;
      return result([{
        id: IDS.contact, first_name: 'Ana', last_name: 'López', email: 'ana@example.com',
        phone: null, municipality: 'Guadalajara', subscriber_status: 'current_subscriber',
        commercial_stage: 'contacted', preferred_channel: 'phone', executive_id: null,
        source: 'crm_manual', acquisition_source: 'referral', declared_tenure_seasons: 2,
        consent_status: 'yes', summary_notes: 'Registro inicial.', row_version: 1
      }]);
    }
    if (sql.startsWith('INSERT INTO contact_consents')) return result([{}]);
    if (sql.startsWith('INSERT INTO memberships')) {
      return result([{ id: IDS.membership, row_version: 1 }]);
    }
    if (sql.startsWith('INSERT INTO membership_units')) {
      this.state.unitsInserted += 1;
      return result([{}]);
    }
    if (sql.startsWith('INSERT INTO interactions')) {
      return result([{
        id: IDS.interaction, contact_id: IDS.contact, actor_id: IDS.actor,
        occurred_at: '2026-08-21T17:00:00.000Z', channel: 'other',
        outcome: 'manual_registration', notes: 'Registro inicial.', is_human_contact: false,
        created_at: '2026-08-21T17:00:00.000Z'
      }]);
    }
    if (sql.startsWith('INSERT INTO tasks')) {
      return result([{ id: IDS.task, row_version: 1 }]);
    }
    if (sql.startsWith('UPDATE contacts c SET next_follow_up_at')) return result([{}]);
    if (sql.startsWith('INSERT INTO manual_registration_requests')) {
      if (this.options.failAtIdempotency) throw new Error('simulated late failure');
      this.state.idempotencyInserted += 1;
      this.state.prior = {
        idempotency_key: params[0], request_hash: params[1], actor_id: params[2],
        contact_id: params[3], membership_id: params[4], interaction_id: params[5], task_id: params[6]
      };
      return result([{}]);
    }
    if (sql.startsWith('SELECT c.*')) {
      return result([{
        id: IDS.contact, first_name: 'Ana', last_name: 'López', email: 'ana@example.com',
        phone: null, municipality: 'Guadalajara', subscriber_status: 'current_subscriber',
        commercial_stage: 'contacted', preferred_channel: 'phone', executive_id: null,
        source: 'crm_manual', acquisition_source: 'referral', declared_tenure_seasons: 2,
        consent_status: 'yes', summary_notes: 'Registro inicial.', row_version: 2,
        seat_count: 2, managed_seat_count: 2, seasons_count: 1, overdue_tasks: 0
      }]);
    }
    if (sql.startsWith('SELECT m.*')) {
      return result([{
        id: IDS.membership, contact_id: IDS.contact, season_code: 'LMP-2026-27',
        membership_status: 'active', seat_count: 2, start_date: '2026-08-21',
        units: registration.membership.units, row_version: 1
      }]);
    }
    if (sql.startsWith('SELECT i.*')) {
      return result([{
        id: IDS.interaction, contact_id: IDS.contact, actor_id: IDS.actor,
        actor_name: actor.displayName, contact_name: 'Ana López',
        occurred_at: '2026-08-21T17:00:00.000Z', channel: 'other',
        outcome: 'manual_registration', notes: 'Registro inicial.', is_human_contact: false,
        created_at: '2026-08-21T17:00:00.000Z'
      }]);
    }
    if (sql.startsWith('SELECT t.*')) {
      return result([{
        id: IDS.task, contact_id: IDS.contact, assigned_to: IDS.actor,
        assignee_name: actor.displayName, contact_name: 'Ana López',
        description: registration.nextTask.description, due_at: registration.nextTask.dueAt,
        priority: 'normal', status: 'pending', row_version: 1
      }]);
    }
    if (sql.startsWith('INSERT INTO audit_events')) {
      this.state.auditsInserted += 1;
      return result([{}]);
    }
    throw new Error(`Unexpected SQL in fake: ${sql}`);
  }
}

const context = {
  actorId: IDS.actor,
  requestId: '00000000-0000-4000-8000-000000000099',
  ipHash: 'a'.repeat(64), userAgent: 'test'
};

test('alta compuesta confirma una transacción y replay conserva IDs sin nuevos inserts/audit', async () => {
  const pool = new FakePool();
  const repository = new PgCrmRepository(pool);
  const options = { idempotencyKey: IDS.key, requestHash: 'b'.repeat(64) };

  const first = await repository.createManualRegistration(registration, actor, context, options);
  assert.equal(first.replayed, false);
  assert.equal(first.contact.id, IDS.contact);
  assert.equal(first.membership.id, IDS.membership);
  assert.equal(first.initialInteraction.isHumanContact, false);
  assert.equal(first.nextTask.id, IDS.task);
  assert.equal(pool.state.unitsInserted, 2);
  assert.equal(pool.state.auditsInserted, 1);
  assert.equal(pool.state.commands.filter((sql) => sql === 'COMMIT').length, 1);

  const replay = await repository.createManualRegistration(registration, actor, context, options);
  assert.equal(replay.replayed, true);
  assert.equal(replay.contact.id, first.contact.id);
  assert.equal(pool.state.contactsInserted, 1);
  assert.equal(pool.state.idempotencyInserted, 1);
  assert.equal(pool.state.auditsInserted, 1);

  await assert.rejects(
    repository.createManualRegistration(registration, actor, context, {
      ...options, requestHash: 'c'.repeat(64)
    }),
    (error) => error.status === 409 && error.code === 'CONFLICT'
  );
});

test('dedupe normaliza contactos y aliases, devuelve IDs sin automerge e incluye eliminados', async () => {
  const pool = new FakePool({
    duplicates: [
      { id: '00000000-0000-4000-8000-000000000030', deleted_at: null },
      { id: '00000000-0000-4000-8000-000000000031', deleted_at: '2026-08-20T00:00:00Z' }
    ]
  });
  const repository = new PgCrmRepository(pool);
  await assert.rejects(
    repository.createManualRegistration(registration, actor, context, {
      idempotencyKey: IDS.key, requestHash: 'd'.repeat(64)
    }),
    (error) => error.status === 409 && error.code === 'DUPLICATE_CONTACT'
      && error.details.matches.length === 2 && error.details.matches[1].deleted === true
  );
  assert.equal(pool.state.contactsInserted, 0);
  const duplicateQuery = pool.state.commands.find(
    (sql) => sql.startsWith('SELECT c.id,c.deleted_at FROM contacts c')
  );
  assert.match(duplicateQuery, /regexp_replace\(COALESCE\(c\.phone,''\),'\[\^0-9\]'/);
  assert.match(duplicateQuery, /contact_phone\.digits ~ '\^\(52\|521\)\[0-9\]\{10\}\$'/);
  assert.match(duplicateQuery, /EXISTS \( SELECT 1 FROM contact_aliases a/);
  assert.match(duplicateQuery, /a\.alias_type='email'/);
  assert.match(duplicateQuery, /a\.alias_type='phone'/);
  assert.match(duplicateQuery, /alias_phone\.digits ~ '\^\(52\|521\)\[0-9\]\{10\}\$'/);
  assert.equal(pool.state.commands.at(-1), 'ROLLBACK');
});

test('falla del último subregistro provoca ROLLBACK y no escribe auditoría', async () => {
  const pool = new FakePool({ failAtIdempotency: true });
  const repository = new PgCrmRepository(pool);
  await assert.rejects(
    repository.createManualRegistration(registration, actor, context, {
      idempotencyKey: IDS.key, requestHash: 'e'.repeat(64)
    }),
    /simulated late failure/
  );
  assert.equal(pool.state.commands.at(-1), 'ROLLBACK');
  assert.equal(pool.state.commands.includes('COMMIT'), false);
  assert.equal(pool.state.auditsInserted, 0);
});

test('POST de contacto toma los mismos locks y revalida duplicados antes del INSERT', async () => {
  const pool = new FakePool({
    duplicates: [{ id: '00000000-0000-4000-8000-000000000032', deleted_at: null }]
  });
  const repository = new PgCrmRepository(pool);
  await assert.rejects(
    repository.createContact(registration.contact, actor, context),
    (error) => error.status === 409 && error.code === 'DUPLICATE_CONTACT'
  );
  assert.equal(pool.state.contactsInserted, 0);
  assert.ok(pool.state.commands.some((sql) => sql.includes('pg_advisory_xact_lock')));
  assert.ok(pool.state.commands.some((sql) =>
    sql.startsWith('SELECT c.id,c.deleted_at FROM contacts c')));
  assert.equal(pool.state.commands.at(-1), 'ROLLBACK');
});
