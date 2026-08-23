import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOperationalDataset } from '../src/lib/operationalDataset.js';

function fixture() {
  const demoContacts = Array.from({ length: 326 }, (_, index) => {
    const commitment = index < 3;
    const withSeats = index < 166;
    const seats = withSeats ? (index < 162 ? 3 : 2) : 0;
    return {
      id: `REAL-${index + 1}`,
      name: `TITULAR ${index + 1}`,
      email: index < 246 ? `titular${index + 1}@example.invalid` : '',
      phone: '',
      type: index < 106 ? 'Abonado nuevo' : index < 235 ? 'Abonado actual' : 'Por renovar',
      stage: index < 235 ? 'Ganado' : 'Por contactar',
      isCommitmentOnly: commitment,
      renewalDate: withSeats ? '2026-08-22T10:00:00' : '',
      seats,
      executive: 'SIN ASIGNAR',
      note: 'CORTE AUDITADO',
      currentMembership: withSeats ? {
        zone: commitment ? 'Zona Suites' : 'VIP',
        product: commitment ? 'ABONO COMPROMISOS' : 'ORDENES LMP 2026-2027',
        membershipSegment: commitment ? 'Compromisos' : 'VIP',
        units: Array.from({ length: seats }, (_, unit) => ({ seatIdentifier: `${index}-${unit}` }))
      } : null
    };
  });
  const demoSales = Array.from({ length: 172 }, (_, index) => ({
    id: String(1000 + index), contact: `TITULAR ${(index % 166) + 1}`,
    occurredAt: '2026-08-22T10:00:00', total: 100, paid: 100, seats: 1,
    zone: 'VIP', kind: 'RENOVACIÓN', owner: 'VENTA EN LÍNEA'
  }));
  return { demoContacts, demoSales };
}

test('normaliza únicamente el corte operativo aprobado y conserva sus invariantes', () => {
  const result = normalizeOperationalDataset(fixture());
  assert.deepEqual(result.metrics, { contacts: 326, memberships: 166, units: 494, sales: 172 });
  assert.equal(result.contacts.filter((contact) => contact.isCommitmentOnly).length, 3);
  assert.equal(result.memberships[0].section, 'VIP');
  assert.ok(result.contacts.slice(246).every((contact) => contact.externalRef && !contact.email && !contact.phone));
});

test('rechaza archivos parciales antes de abrir una transacción', () => {
  const input = fixture();
  input.demoContacts.pop();
  assert.throws(() => normalizeOperationalDataset(input), /326 titulares/);
});
