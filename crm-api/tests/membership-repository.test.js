import test from 'node:test';
import assert from 'node:assert/strict';
import { PgCrmRepository } from '../src/repositories/PgCrmRepository.js';

const IDS = Object.freeze({
  actor: '00000000-0000-4000-8000-000000000001',
  contact: '00000000-0000-4000-8000-000000000010',
  membership: '00000000-0000-4000-8000-000000000020',
  unit1: '00000000-0000-4000-8000-000000000021',
  request: '00000000-0000-4000-8000-000000000099'
});

const actor = {
  id: IDS.actor, role: 'admin', displayName: 'Administrador', permissionGrants: []
};
const context = {
  actorId: IDS.actor, requestId: IDS.request, ipHash: 'a'.repeat(64), userAgent: 'test'
};

function result(rows = []) {
  return { rows, rowCount: rows.length };
}

function baseState() {
  return {
    membership: {
      id: IDS.membership, contact_id: IDS.contact, season_code: 'LMP-2026-27',
      membership_status: 'active', seat_count: 1, seat_identifier: null,
      zone: 'VIP24', section: null, product: 'Abono histórico',
      start_date: '2026-01-01', renewal_date: null, row_version: 1,
      deleted_at: null
    },
    units: [{
      id: IDS.unit1, membership_id: IDS.membership, unit_number: 1,
      seat_identifier: null, zone: 'VIP24', product: 'Abono histórico',
      jersey_size: 'M', row_version: 1, deleted_at: null, deleted_by: null
    }],
    audits: []
  };
}

class MembershipPool {
  constructor({ conflictSeats = [], failAudit = false, existingMembership = true } = {}) {
    this.state = baseState();
    if (!existingMembership) {
      this.state.membership = null;
      this.state.units = [];
    }
    this.conflictSeats = new Set(conflictSeats);
    this.failAudit = failAudit;
    this.commands = [];
    this.snapshot = null;
    this.client = { query: (sql, params = []) => this.query(sql, params), release() {} };
  }

  async connect() { return this.client; }

  activeUnits() {
    return this.state.units.filter((unit) => !unit.deleted_at).sort((a, b) => a.unit_number - b.unit_number);
  }

  hydratedMembership() {
    return {
      ...this.state.membership,
      units: this.activeUnits().map((unit) => ({
        id: unit.id, unitNumber: unit.unit_number, seatIdentifier: unit.seat_identifier,
        zone: unit.zone, product: unit.product, jerseySize: unit.jersey_size
      }))
    };
  }

  async query(text, params = []) {
    const sql = String(text).replace(/\s+/g, ' ').trim();
    this.commands.push({ sql, params });
    if (sql === 'BEGIN') {
      this.snapshot = structuredClone(this.state);
      return result();
    }
    if (sql === 'COMMIT') { this.snapshot = null; return result(); }
    if (sql === 'ROLLBACK') {
      if (this.snapshot) this.state = this.snapshot;
      this.snapshot = null;
      return result();
    }
    if (sql.includes('pg_advisory_xact_lock')) return result([{}]);
    if (sql.startsWith('SELECT c.*')) {
      return result([{
        id: IDS.contact, first_name: 'Ana', last_name: 'López', email: 'ana@example.com',
        subscriber_status: 'current_subscriber', commercial_stage: 'contacted',
        consent_status: 'unknown', row_version: 1, deleted_at: null
      }]);
    }
    if (sql.startsWith('SELECT id FROM memberships')) {
      const membership = this.state.membership;
      return result(membership && !membership.deleted_at
        && membership.contact_id === params[0] && membership.season_code === params[1]
        ? [{ id: membership.id }]
        : []);
    }
    if (sql.startsWith('SELECT m.* FROM memberships m JOIN contacts')) {
      const membership = this.state.membership;
      return result(membership && membership.id === params[0] && !membership.deleted_at
        ? [{ ...membership }]
        : []);
    }
    if (sql.startsWith('SELECT * FROM membership_units')) {
      return result(this.state.units.map((unit) => ({ ...unit })));
    }
    if (sql.startsWith('SELECT DISTINCT lower(regexp_replace')) {
      return result(params[2].filter((seat) => this.conflictSeats.has(seat)).map((seat) => ({ seat })));
    }
    if (sql.startsWith('SELECT pb.version,pb.currency')) {
      const localities = {
        vip: ['VIP', 2992000, 2244000, 'official_unit'],
        planta_baja_central: ['Preferente', 1598000, 1198500, 'official_unit'],
        lateral_1_3: ['General', 748000, 748000, 'two_for_one']
      };
      const locality = localities[params[1]];
      if (!locality) return result();
      return result([{
        version: 'LMP-2026-27-v1', currency: 'MXN', locality_code: params[1],
        locality_name: params[1], section: locality[0], list_unit_price: locality[1],
        july25_unit_price: locality[2], july25_mode: locality[3],
        discount_code: params[2], discount_name: 'Sin descuento',
        discount_mode: 'regular', rate_basis_points: 0
      }]);
    }
    if (sql.startsWith('UPDATE memberships')) {
      if (this.state.membership.row_version !== params[18]) return result();
      this.state.membership.section = params[0];
      this.state.membership.seat_count = params[1];
      this.state.membership.updated_by = params[2];
      Object.assign(this.state.membership, {
        price_book_version: params[3], currency: params[4], locality_code: params[5],
        locality_name: params[6], discount_code: params[7], discount_name: params[8],
        pricing_mode: params[9], list_unit_price: params[10], commercial_value: params[11],
        net_amount: params[12], discount_amount: params[13], effective_unit_price: params[14],
        charged_units: params[15], bonus_units: params[16]
      });
      this.state.membership.row_version += 1;
      return result([{ ...this.state.membership }]);
    }
    if (sql.startsWith('INSERT INTO memberships')) {
      this.state.membership = {
        id: IDS.membership, contact_id: params[0], season_code: params[1],
        membership_status: params[2], seat_count: params[3], seat_identifier: params[4],
        zone: params[5], section: params[6], product: params[7], start_date: params[8],
        renewal_date: params[9], created_by: params[10], updated_by: params[10],
        price_book_version: params[11], currency: params[12], locality_code: params[13],
        locality_name: params[14], discount_code: params[15], discount_name: params[16],
        pricing_mode: params[17], list_unit_price: params[18], commercial_value: params[19],
        net_amount: params[20], discount_amount: params[21], effective_unit_price: params[22],
        charged_units: params[23], bonus_units: params[24],
        row_version: 1, deleted_at: null
      };
      return result([{ ...this.state.membership }]);
    }
    if (sql.startsWith('INSERT INTO membership_units') && sql.includes('ON CONFLICT')) {
      const [membershipId, unitNumber, seatIdentifier, zone, product, actorId] = params;
      let unit = this.state.units.find((candidate) =>
        candidate.membership_id === membershipId && candidate.unit_number === unitNumber);
      if (!unit) {
        unit = {
          id: `00000000-0000-4000-8000-${String(100 + unitNumber).padStart(12, '0')}`,
          membership_id: membershipId, unit_number: unitNumber, zone, product,
          jersey_size: null, created_by: actorId, row_version: 1
        };
        this.state.units.push(unit);
      } else {
        unit.row_version += 1;
      }
      unit.seat_identifier = seatIdentifier;
      unit.updated_by = actorId;
      unit.deleted_at = null;
      unit.deleted_by = null;
      return result([{}]);
    }
    if (sql.startsWith('INSERT INTO membership_units')) {
      this.state.units.push({
        id: IDS.unit1, membership_id: params[0], unit_number: params[1],
        seat_identifier: params[2], zone: params[3], product: params[4],
        jersey_size: params[5], created_by: params[6], updated_by: params[6],
        row_version: 1, deleted_at: null, deleted_by: null
      });
      return result([{}]);
    }
    if (sql.startsWith('UPDATE membership_units SET deleted_at')) {
      for (const unit of this.state.units) {
        if (unit.membership_id === params[0] && unit.unit_number > params[2] && !unit.deleted_at) {
          unit.deleted_at = '2026-08-22T18:00:00.000Z';
          unit.deleted_by = params[1];
          unit.updated_by = params[1];
          unit.row_version += 1;
        }
      }
      return result();
    }
    if (sql.startsWith('SELECT m.*') && sql.includes('LEFT JOIN membership_units')) {
      return result([this.hydratedMembership()]);
    }
    if (sql.startsWith('INSERT INTO audit_events')) {
      if (this.failAudit) throw new Error('simulated audit failure');
      this.state.audits.push({
        action: params[1], entityType: params[2], entityId: params[3],
        before: params[5], after: params[6], metadata: params[7]
      });
      return result([{}]);
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

function assignment(section, seats) {
  const localityCode = section === 'VIP' ? 'vip'
    : section === 'Preferente' ? 'planta_baja_central' : 'lateral_1_3';
  return {
    section,
    localityCode,
    discountCode: 'regular',
    seatCount: seats.length,
    units: seats.map((seatIdentifier, index) => ({ unitNumber: index + 1, seatIdentifier }))
  };
}

test('PATCH expande una membresía importada preservando IDs, zone y datos auxiliares', async () => {
  const pool = new MembershipPool();
  const repository = new PgCrmRepository(pool);
  const updated = await repository.updateMembership(
    IDS.membership, assignment('VIP', ['A-1', 'A-2', 'A-3']), actor, context, 1
  );

  assert.equal(updated.rowVersion, 2);
  assert.equal(updated.section, 'VIP');
  assert.equal(updated.zone, 'VIP24');
  assert.deepEqual(updated.units.map((unit) => unit.seatIdentifier), ['A-1', 'A-2', 'A-3']);
  assert.equal(pool.state.units[0].id, IDS.unit1);
  assert.equal(pool.state.units[0].zone, 'VIP24');
  assert.equal(pool.state.units[0].jersey_size, 'M');
  assert.equal(pool.state.audits.length, 1);
  assert.deepEqual(pool.state.audits[0].before, {
    id: IDS.membership, membershipStatus: 'active', section: null,
    seatCount: 1, rowVersion: 1, seasonCode: 'LMP-2026-27'
  });
  assert.equal(pool.state.audits[0].after.section, 'VIP');
  assert.equal(pool.state.audits[0].metadata.seatIdentifiersChanged, true);
  assert.equal(JSON.stringify(pool.state.audits[0]).includes('A-1'), false);
  assert.equal(pool.commands.at(-1).sql, 'COMMIT');
});

test('PATCH reduce y reexpande reviviendo las mismas unidades sin perder IDs', async () => {
  const pool = new MembershipPool();
  const repository = new PgCrmRepository(pool);
  await repository.updateMembership(
    IDS.membership, assignment('VIP', ['A-1', 'A-2', 'A-3']), actor, context, 1
  );
  const expandedIds = pool.state.units.map((unit) => unit.id);
  await repository.updateMembership(
    IDS.membership, assignment('Preferente', ['P-1']), actor, context, 2
  );
  assert.equal(pool.activeUnits().length, 1);
  assert.equal(pool.state.units.filter((unit) => unit.deleted_at).length, 2);
  await repository.updateMembership(
    IDS.membership, assignment('General', ['G-1', 'G-2', 'G-3']), actor, context, 3
  );
  assert.deepEqual(pool.state.units.map((unit) => unit.id), expandedIds);
  assert.equal(pool.activeUnits().length, 3);
  assert.ok(pool.activeUnits().every((unit) => unit.zone === 'VIP24'));
});

test('PATCH rechaza versión obsoleta o butaca ocupada y revierte todo sin auditoría', async () => {
  const stalePool = new MembershipPool();
  await assert.rejects(
    new PgCrmRepository(stalePool).updateMembership(
      IDS.membership, assignment('VIP', ['A-1']), actor, context, 9
    ),
    (error) => error.status === 409
  );
  assert.deepEqual(stalePool.state, baseState());
  assert.equal(stalePool.commands.at(-1).sql, 'ROLLBACK');

  const conflictPool = new MembershipPool({ conflictSeats: ['a-2'] });
  await assert.rejects(
    new PgCrmRepository(conflictPool).updateMembership(
      IDS.membership, assignment('VIP', ['A-2']), actor, context, 1
    ),
    (error) => error.status === 409
      && error.details.seats.length === 1 && error.details.seats[0] === 'A-2'
  );
  assert.deepEqual(conflictPool.state, baseState());
  assert.equal(JSON.stringify(conflictPool.commands).includes('Ana'), false);
});

test('fallo tardío de auditoría revierte parent y unidades', async () => {
  const pool = new MembershipPool({ failAudit: true });
  await assert.rejects(
    new PgCrmRepository(pool).updateMembership(
      IDS.membership, assignment('VIP', ['A-1', 'A-2']), actor, context, 1
    ),
    /simulated audit failure/
  );
  assert.deepEqual(pool.state, baseState());
  assert.equal(pool.commands.at(-1).sql, 'ROLLBACK');
});

test('POST bloquea contact-season y rechaza una segunda membresía antes de insertar', async () => {
  const pool = new MembershipPool();
  const repository = new PgCrmRepository(pool);
  await assert.rejects(
    repository.createMembership(IDS.contact, {
      seasonCode: 'LMP-2026-27', membershipStatus: 'active', section: 'VIP',
      seatCount: 1, startDate: '2026-08-22',
      units: [{ unitNumber: 1, seatIdentifier: 'A-1' }]
    }, actor, context),
    (error) => error.status === 409 && /ya tiene un abono/.test(error.message)
  );
  assert.ok(pool.commands.some((command) =>
    command.params[0] === `membership-season:${IDS.contact}:LMP-2026-27`));
  assert.ok(pool.commands.some((command) =>
    command.params[0] === 'membership-seat:LMP-2026-27:VIP:a-1'));
  assert.equal(pool.commands.some((command) => command.sql.startsWith('INSERT INTO memberships')), false);
  assert.equal(pool.commands.at(-1).sql, 'ROLLBACK');
});

test('POST crea section separada de zone y rechaza butacas ocupadas sin PII', async () => {
  const conflictPool = new MembershipPool({ existingMembership: false, conflictSeats: ['p-10'] });
  const data = {
    seasonCode: 'LMP-2026-27', membershipStatus: 'active', section: 'Preferente',
    localityCode: 'planta_baja_central', discountCode: 'regular',
    seatCount: 1, startDate: '2026-08-22',
    units: [{ unitNumber: 1, seatIdentifier: 'P-10', zone: 'PLANTA BAJA1RA' }]
  };
  await assert.rejects(
    new PgCrmRepository(conflictPool).createMembership(IDS.contact, data, actor, context),
    (error) => error.status === 409
      && error.details.seats[0] === 'P-10' && !JSON.stringify(error).includes('Ana')
  );
  assert.equal(conflictPool.commands.some((command) =>
    command.sql.startsWith('INSERT INTO memberships')), false);

  const pool = new MembershipPool({ existingMembership: false });
  const created = await new PgCrmRepository(pool).createMembership(
    IDS.contact, data, actor, context
  );
  assert.equal(created.section, 'Preferente');
  assert.equal(pool.state.membership.section, 'Preferente');
  assert.equal(pool.state.membership.zone, null);
  assert.equal(pool.state.units[0].zone, 'PLANTA BAJA1RA');
  assert.equal(pool.state.audits[0].metadata.section, 'Preferente');
  assert.equal(pool.commands.at(-1).sql, 'COMMIT');
});
