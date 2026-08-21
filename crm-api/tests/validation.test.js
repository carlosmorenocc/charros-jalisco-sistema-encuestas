import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseListQuery,
  validateContact,
  validateDashboardPdfEvent,
  validateInteraction,
  validateMembership,
  validatePayment,
  validateSale
} from '../src/lib/validation.js';

const UUID = '00000000-0000-4000-8000-000000000001';

test('normaliza un contacto válido y exige un medio de contacto', () => {
  const contact = validateContact({
    firstName: '  Ana María ', lastName: ' López ', email: 'ANA@EXAMPLE.COM',
    subscriberStatus: 'prospect', commercialStage: 'to_contact'
  });
  assert.equal(contact.firstName, 'Ana María');
  assert.equal(contact.email, 'ana@example.com');
  assert.throws(() => validateContact({
    firstName: 'Ana', lastName: 'López', subscriberStatus: 'prospect', commercialStage: 'to_contact'
  }), /email o phone/);
});

test('no permite consentimiento nulo ni coerción de booleanos', () => {
  assert.throws(() => validateContact({ consentStatus: null }, { partial: true }), /valor no permitido/);
  assert.throws(() => validateInteraction({
    channel: 'email', outcome: 'sent', notes: 'test', isHumanContact: 'false'
  }), /booleano/);
});

test('un abono operativo requiere una unidad por cada asiento', () => {
  assert.throws(() => validateMembership({
    seasonCode: 'LMP-2026-27', membershipStatus: 'active', seatCount: 2, units: []
  }), /coincidir/);
  const membership = validateMembership({
    seasonCode: 'LMP-2026-27', membershipStatus: 'active', seatCount: 2,
    startDate: '2026-08-21T00:00:00.000Z',
    units: [{ jerseySize: 'M' }, { jerseySize: 'XL' }]
  });
  assert.deepEqual(membership.units.map((unit) => unit.unitNumber), [1, 2]);
});

test('venta confirmada exige fecha y los pagos deben ser positivos', () => {
  assert.throws(() => validateSale({
    contactId: UUID,
    executiveId: UUID,
    seasonCode: 'LMP-2026-27',
    status: 'confirmed',
    items: [{ product: 'Abono', quantity: 1, unitPrice: 1000 }]
  }), /soldAt/);
  assert.throws(() => validatePayment({ amount: 0, method: 'card' }), /mayor o igual/);
  assert.equal(validatePayment({ amount: 500, method: 'card' }).amount, 500);
});

test('segmenta listados de contactos sin aceptar valores libres', () => {
  const parsed = parseListQuery({
    segment: 'portfolio', assignment: 'unassigned', dateField: 'lastContact',
    season: ' LMP-2026-27 ', lastChannel: 'whatsapp'
  });
  assert.equal(parsed.segment, 'portfolio');
  assert.equal(parsed.assignment, 'unassigned');
  assert.equal(parsed.dateField, 'lastContact');
  assert.equal(parsed.season, 'LMP-2026-27');
  assert.equal(parsed.lastChannel, 'whatsapp');
  assert.throws(() => parseListQuery({ segment: 'all-records' }), /segment/);
  assert.throws(() => parseListQuery({ assignment: 'anyone' }), /assignment/);
  assert.throws(() => parseListQuery({ dateField: 'raw_sql' }), /dateField/);
  assert.throws(() => parseListQuery({ season: 'LMP-2026-2027' }), /season/);
});

test('evento PDF conserva solo filtros no sensibles permitidos', () => {
  assert.deepEqual(validateDashboardPdfEvent({
    filters: { season: 'LMP-2026-27', executiveId: UUID }
  }), { filters: { season: 'LMP-2026-27', executiveId: UUID } });
  assert.throws(
    () => validateDashboardPdfEvent({ filters: { executiveName: 'Dato personal' } }),
    /campos no permitidos/
  );
  assert.throws(
    () => validateDashboardPdfEvent({ generatedAt: new Date().toISOString(), filters: {} }),
    /campos no permitidos/
  );
});
