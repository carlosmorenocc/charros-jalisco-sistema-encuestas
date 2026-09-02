import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseListQuery,
  validateContact,
  validateDashboardPdfEvent,
  validateInteraction,
  validateManualRegistration,
  validateMembership,
  validateMembershipCreation,
  validateMembershipSeatAssignment,
  validateSubscriptionQuote,
  validatePayment,
  validateSale,
  validateSaleCorrection,
  validateSaleCancellation
} from '../src/lib/validation.js';

const UUID = '00000000-0000-4000-8000-000000000001';

test('anulación de venta exige un motivo auditable', () => {
  assert.throws(() => validateSaleCancellation({ reason: 'dup' }), /5 caracteres/);
  assert.deepEqual(validateSaleCancellation({ reason: ' Registro duplicado ' }), {
    reason: 'Registro duplicado'
  });
});

test('normaliza un contacto válido y exige un medio de contacto', () => {
  const contact = validateContact({
    firstName: '  Ana María ', lastName: ' López ', email: 'ANA@EXAMPLE.COM',
    subscriberStatus: 'prospect', commercialStage: 'to_contact'
  });
  assert.equal(contact.firstName, 'ANA MARÍA');
  assert.equal(contact.lastName, 'LÓPEZ');
  assert.equal(contact.email, 'ana@example.com');
  assert.throws(() => validateContact({
    firstName: 'Ana', lastName: 'López', subscriberStatus: 'prospect', commercialStage: 'to_contact'
  }), /email o phone/);
});

test('canonicaliza teléfonos mexicanos igual que el importador inicial', () => {
  for (const source of ['3312345678', '+52 33 1234 5678', '5213312345678']) {
    const contact = validateContact({
      firstName: 'Ana', lastName: 'López', phone: source,
      subscriberStatus: 'prospect', commercialStage: 'to_contact'
    });
    assert.equal(contact.phone, '3312345678');
  }
  assert.throws(() => validateContact({
    firstName: 'Ana', lastName: 'López', phone: '331234567',
    subscriberStatus: 'prospect', commercialStage: 'to_contact'
  }), /10 dígitos/);
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

test('asignación manual de butacas exige sección, secuencia y lugares únicos', () => {
  const value = validateMembershipSeatAssignment({
    section: 'Preferente',
    localityCode: 'planta_baja_central', discountCode: 'regular',
    seatCount: 2,
    units: [
      { unitNumber: 1, seatIdentifier: ' Fila A  10 ' },
      { unitNumber: 2, seatIdentifier: 'Fila A 11' }
    ]
  });
  assert.equal(value.section, 'Preferente');
  assert.deepEqual(value.units, [
    { unitNumber: 1, seatIdentifier: 'Fila A 10' },
    { unitNumber: 2, seatIdentifier: 'Fila A 11' }
  ]);

  for (const invalid of ['vip', 'Premier', '', null]) {
    assert.throws(() => validateMembershipSeatAssignment({
      section: invalid, seatCount: 1,
      units: [{ unitNumber: 1, seatIdentifier: 'A-1' }]
    }), /section/);
  }
  assert.throws(() => validateMembershipSeatAssignment({
    section: 'VIP', localityCode: 'vip', discountCode: 'regular', seatCount: 21,
    units: Array.from({ length: 21 }, (_, index) => ({
      unitNumber: index + 1, seatIdentifier: `A-${index + 1}`
    }))
  }), /entre 1 y 20/);
  assert.throws(() => validateMembershipSeatAssignment({
    section: 'VIP', localityCode: 'vip', discountCode: 'regular', seatCount: 2,
    units: [{ unitNumber: 1, seatIdentifier: 'A-1' }]
  }), /coincidir/);
  assert.throws(() => validateMembershipSeatAssignment({
    section: 'VIP', localityCode: 'vip', discountCode: 'regular', seatCount: 2,
    units: [
      { unitNumber: 2, seatIdentifier: 'A-1' },
      { unitNumber: 1, seatIdentifier: 'A-2' }
    ]
  }), /secuencia exacta/);
  assert.throws(() => validateMembershipSeatAssignment({
    section: 'VIP', localityCode: 'vip', discountCode: 'regular', seatCount: 2,
    units: [
      { unitNumber: 1, seatIdentifier: 'A-1' },
      { unitNumber: 2, seatIdentifier: ' a-1 ' }
    ]
  }), /butaca debe ser única/);
});

test('asignación manual rechaza butacas vacías, unidades inválidas y sobrecarga', () => {
  const base = {
    section: 'General', localityCode: 'lateral_1_3', discountCode: 'regular', seatCount: 1,
    units: [{ unitNumber: 1, seatIdentifier: 'G-1' }]
  };
  assert.throws(() => validateMembershipSeatAssignment({
    ...base, units: [{ unitNumber: 1, seatIdentifier: '   ' }]
  }), /obligatorio/);
  assert.throws(() => validateMembershipSeatAssignment({ ...base, units: [null] }), /arreglo/);
  assert.throws(() => validateMembershipSeatAssignment({ ...base, injected: true }), /campos no permitidos/);
  assert.throws(() => validateMembershipSeatAssignment({
    ...base, units: [{ ...base.units[0], zone: 'VIP24' }]
  }), /campos no permitidos/);
});

test('POST independiente exige sección y butacas sin endurecer altas manuales heredadas', () => {
  const input = {
    seasonCode: 'LMP-2026-27', membershipStatus: 'active', section: 'VIP',
    localityCode: 'vip', discountCode: 'regular',
    seatCount: 1, startDate: '2026-08-22',
    units: [{ unitNumber: 1, seatIdentifier: 'A-1', zone: 'VIP24', jerseySize: 'M' }]
  };
  assert.equal(validateMembershipCreation(input).section, 'VIP');
  assert.throws(
    () => validateMembershipCreation({
      ...input, section: undefined,
      units: [{ unitNumber: 1, seatIdentifier: 'A-1' }]
    }),
    /section/
  );
  assert.throws(
    () => validateMembershipCreation({ ...input, injected: true }),
    /campos no permitidos/
  );

  const legacy = validateMembership({
    seasonCode: 'LMP-2026-27', membershipStatus: 'active', seatCount: 1,
    startDate: '2026-08-22', zone: 'PLANTA BAJA CENTRAL',
    units: [{ unitNumber: 1, zone: 'PLANTA BAJA CENTRAL', jerseySize: 'M' }]
  });
  assert.equal(legacy.section, undefined);
  assert.equal(legacy.zone, 'PLANTA BAJA CENTRAL');

  assert.throws(() => validateManualRegistration({
    contact: manualContact(),
    initialObservation: { notes: 'Alta con sección incompleta.' },
    membership: manualMembership({
      section: 'VIP', localityCode: 'vip', discountCode: 'regular'
    })
  }, { defaultAssigneeId: ADMIN_ID }), /seatIdentifier es obligatorio/);
});

test('cotizacion exige localidad, descuento y cantidad explicitos', () => {
  assert.deepEqual(validateSubscriptionQuote({
    localityCode: 'vip_lateral', discountCode: 'july25', seatCount: '3'
  }), { localityCode: 'vip_lateral', discountCode: 'july25', seatCount: 3 });
  assert.throws(() => validateSubscriptionQuote({
    localityCode: 'vip', seatCount: 1
  }), /discountCode/);
  assert.throws(() => validateSubscriptionQuote({
    localityCode: 'VIP', discountCode: 'regular', seatCount: 1
  }), /localityCode/);
});

test('venta confirmada exige fecha y los pagos deben ser positivos', () => {
  assert.throws(() => validateSale({
    externalOrderNumber: '26000123',
    saleType: 'new',
    closeStage: 'won',
    contactId: UUID,
    executiveId: UUID,
    seasonCode: 'LMP-2026-27',
    status: 'confirmed',
    items: [{ product: 'Abono', quantity: 1, unitPrice: 1000 }]
  }), /soldAt/);
  assert.throws(() => validatePayment({ amount: 0, method: 'card' }), /mayor o igual/);
  assert.equal(validatePayment({ amount: 500, method: 'card' }).amount, 500);
});

test('distribución multititular conserva exactamente la cantidad de la orden', () => {
  const secondary = '00000000-0000-4000-8000-000000000002';
  const base = {
    externalOrderNumber: '26000124', saleType: 'new', closeStage: 'reserved',
    contactId: UUID, executiveId: UUID, seasonCode: 'LMP-2026-27', status: 'reserved',
    soldAt: '2026-09-02T12:00:00.000Z',
    items: [{ product: 'Abono', quantity: 4, unitPrice: 1000 }]
  };
  const value = validateSale({ ...base, holderAssignments: [
    { contactId: UUID, quantity: 3, isPrimary: true },
    { contactId: secondary, quantity: 1, isPrimary: false }
  ] });
  assert.equal(value.holderAssignments.reduce((sum, holder) => sum + holder.quantity, 0), 4);
  assert.throws(() => validateSale({ ...base, holderAssignments: [
    { contactId: UUID, quantity: 2, isPrimary: true },
    { contactId: secondary, quantity: 1, isPrimary: false }
  ] }), /sumar exactamente/);
  assert.throws(() => validateSale({ ...base, holderAssignments: [
    { contactId: UUID, quantity: 3, isPrimary: false },
    { contactId: secondary, quantity: 1, isPrimary: true }
  ] }), /titular principal/);
});

test('corrección de venta exige motivo y nunca acepta cobros nuevos', () => {
  const base = {
    externalOrderNumber: '26000123', saleType: 'new', closeStage: 'won',
    contactId: UUID, executiveId: UUID, seasonCode: 'LMP-2026-27',
    status: 'confirmed', soldAt: '2026-08-25T12:00:00.000Z',
    items: [{ product: 'Abono', quantity: 1, unitPrice: 1000 }]
  };
  assert.throws(() => validateSaleCorrection({ ...base, reason: 'mal' }), /5 caracteres/);
  const corrected = validateSaleCorrection({ ...base, reason: 'Precio capturado incorrectamente', payments: [{ amount: 100, method: 'card' }] });
  assert.deepEqual(corrected.payments, []);
  assert.equal(corrected.reason, 'Precio capturado incorrectamente');
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

const ADMIN_ID = '00000000-0000-4000-8000-000000000009';

function manualContact(overrides = {}) {
  return {
    firstName: 'Ana', lastName: 'López', email: 'ana@example.com',
    subscriberStatus: 'current_subscriber', commercialStage: 'contacted',
    businessSource: 'referral', declaredTenureSeasons: 2,
    ...overrides
  };
}

function manualMembership(overrides = {}) {
  return {
    seatCount: 2,
    startDate: '2026-08-21T00:00:00.000Z',
    units: [
      { unitNumber: 1, jerseySize: 'M' },
      { unitNumber: 2, jerseySize: null }
    ],
    ...overrides
  };
}

test('alta manual deriva temporada, membresía, provenance y aviso legal en servidor', () => {
  const value = validateManualRegistration({
    contact: manualContact(),
    consent: { status: 'yes' },
    initialObservation: { notes: 'Registro presencial.' },
    membership: manualMembership()
  }, { defaultAssigneeId: ADMIN_ID });
  assert.equal(value.contact.source, 'crm_manual');
  assert.equal(value.contact.acquisitionSource, 'referral');
  assert.equal(value.consent.privacyNoticeVersion, '2026-08-01');
  assert.equal(value.membership.seasonCode, 'LMP-2026-27');
  assert.equal(value.membership.membershipStatus, 'active');
  assert.equal(value.membership.units[1].jerseySize, null);
});

test('prospecto no fabrica abono ni temporadas declaradas desconocidas', () => {
  const value = validateManualRegistration({
    contact: manualContact({
      subscriberStatus: 'prospect', declaredTenureSeasons: null
    }),
    initialObservation: { notes: 'Prospecto nuevo.' },
    membership: null
  }, { defaultAssigneeId: ADMIN_ID });
  assert.equal(value.membership, null);
  assert.equal(value.contact.declaredTenureSeasons, null);
  assert.equal(value.consent.status, 'unknown');
  assert.equal(value.consent.privacyNoticeVersion, null);
  assert.throws(() => validateManualRegistration({
    contact: manualContact({ subscriberStatus: 'prospect' }),
    initialObservation: { notes: 'No corresponde.' },
    membership: manualMembership()
  }, { defaultAssigneeId: ADMIN_ID }), /prospecto no debe registrar abonos/i);
});

test('alta manual rechaza sobrecarga, secuencia incompleta, más de 20 y tarea pasada', () => {
  const base = {
    contact: manualContact(),
    initialObservation: { notes: 'Observación.' }
  };
  assert.throws(() => validateManualRegistration({
    ...base, contact: { ...base.contact, source: 'inyectada' }, membership: manualMembership()
  }, { defaultAssigneeId: ADMIN_ID }), /campos no permitidos/);
  assert.throws(() => validateManualRegistration({
    ...base,
    membership: manualMembership({ units: [{ unitNumber: 2 }, { unitNumber: 3 }] })
  }, { defaultAssigneeId: ADMIN_ID }), /secuencia exacta/);
  assert.throws(() => validateManualRegistration({
    ...base,
    membership: manualMembership({
      seatCount: 21,
      units: Array.from({ length: 21 }, (_, index) => ({ unitNumber: index + 1 }))
    })
  }, { defaultAssigneeId: ADMIN_ID }), /no puede exceder 20/);
  assert.throws(() => validateManualRegistration({
    ...base,
    membership: manualMembership(),
    nextTask: { description: 'Llamar', dueAt: '2020-01-01T00:00:00.000Z' }
  }, { defaultAssigneeId: ADMIN_ID }), /debe estar en el futuro/);
});

test('renovación exige fecha y conserva sus abonos como cantidad gestionada', () => {
  const input = {
    contact: manualContact({ subscriberStatus: 'renewing' }),
    initialObservation: { notes: 'Renovación pendiente.' },
    membership: manualMembership({ startDate: undefined })
  };
  assert.throws(
    () => validateManualRegistration(input, { defaultAssigneeId: ADMIN_ID }),
    /renewalDate es obligatoria/
  );
  const value = validateManualRegistration({
    ...input,
    membership: { ...input.membership, renewalDate: '2026-08-30T00:00:00.000Z' }
  }, { defaultAssigneeId: ADMIN_ID });
  assert.equal(value.membership.membershipStatus, 'renewing');
  assert.equal(value.membership.seatCount, 2);
});
