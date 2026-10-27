import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ROSTER_PROGRAMS,
  RosterValidationError,
  validateRosterPayload
} from '../src/roster.js';

const expectedTotals = (programs, VIP, PREFERENTE, GENERAL) => ({
  programs,
  bySegment: { VIP,PREFERENTE,GENERAL }
});

function record(overrides = {}) {
  return {
    orderNumber: 'ORD-001',
    holderName: 'Persona Sintética',
    holderEmail: 'persona@example.test',
    holderPhone: '+52 000 000 0000',
    zone: 'VIP',
    section: 'A',
    seat: '1',
    sourceEvent: 'Abono sintético 2026-2027',
    segment: 'VIP',
    ...overrides
  };
}

function payload(records, totals = expectedTotals(records.length,records.length,0,0)) {
  return {
    seasonCode: 'LMP-2026-27',
    sourceFilename: 'padron-sintetico.json',
    expectedTotals: totals,
    records
  };
}

test('normaliza, ordena y resume un registro por butaca sin deduplicar contactos',() => {
  const input = payload([
    record({
      orderNumber: ' ORD-002 ',
      holderName: ' Persona  Beta ',
      holderEmail: 'CONTACTO@EXAMPLE.TEST',
      holderPhone: '+52 000 000 0000',
      zone: ' General ',
      section: 200,
      seat: 8,
      segment: ' general ',
      seller: ' Venta  Digital ',
      discountLabel: ' Sin descuento ',
      purchasedAt: '2026-09-01T12:00:00-06:00',
      paymentType: ' Tarjeta ',
      sourceReference: 22
    }),
    record({
      orderNumber: 'ORD-001',
      holderName: 'Persona Sintética',
      holderEmail: 'contacto@example.test',
      holderPhone: '+52 000 000 0000',
      seat: '2',
      purchaseCode: ' COMPRA-1 ',
      barcode: 10002
    }),
    record({
      orderNumber: 'ORD-001',
      holderName: ' Persona  Sintetica ',
      holderEmail: 'contacto@example.test',
      holderPhone: '+52 (000) 000-0000',
      zone: 'Preferente',
      section: 'B',
      seat: '3',
      segment: 'preferente'
    })
  ],expectedTotals(3,1,1,1));

  const result = validateRosterPayload(input);

  assert.deepEqual(result.totals,{
    programs: 3,
    orders: 2,
    holders: 2,
    bySegment: { VIP:1,PREFERENTE:1,GENERAL:1 }
  });
  assert.deepEqual(result.expectedTotals,expectedTotals(3,1,1,1));
  assert.equal(result.seasonCode,'LMP-2026-27');
  assert.equal(result.sourceFilename,'padron-sintetico.json');
  assert.deepEqual(result.records.map((item) => item.orderNumber),['ORD-001','ORD-001','ORD-002']);
  const purchasedRecord = result.records.find((item) => item.purchaseCode === 'COMPRA-1');
  const generalRecord = result.records.find((item) => item.segment === 'GENERAL');
  assert.equal(purchasedRecord.barcode,'10002');
  assert.equal(generalRecord.holderEmail,'contacto@example.test');
  assert.equal(generalRecord.section,'200');
  assert.equal(generalRecord.purchasedAt,'2026-09-01T18:00:00.000Z');
  assert.equal(generalRecord.sourceReference,'22');
  assert.match(result.sha256,/^[a-f0-9]{64}$/u);
});

test('calcula una huella estable sin depender del orden, nombre de archivo o totales declarados',() => {
  const records = [
    record({ orderNumber:'ORD-B',seat:'2',segment:'GENERAL',zone:'General' }),
    record({ orderNumber:'ORD-A',seat:'1',seller:'Canal sintético' })
  ];
  const totals = expectedTotals(2,1,0,1);
  const first = validateRosterPayload(payload(records,totals));
  const secondPayload = payload([...records].reverse(),{
    bySegment: { GENERAL:1,PREFERENTE:0,VIP:1 },
    programs: 2
  });
  secondPayload.sourceFilename = '  otro  nombre.json  ';
  const second = validateRosterPayload(secondPayload);

  assert.equal(first.sha256,second.sha256);
  assert.equal(second.sourceFilename,'otro nombre.json');

  const changed = structuredClone(secondPayload);
  changed.records[1].seller = 'Canal sintético corregido';
  assert.notEqual(first.sha256,validateRosterPayload(changed).sha256);
});

test('rechaza duplicados programáticos y duplicados de la misma butaca bajo otra orden',() => {
  assert.throws(
    () => validateRosterPayload(payload([
      record(),
      record({ orderNumber:'ord-001',zone:'vip',section:'a',seat:'1' })
    ],expectedTotals(2,2,0,0))),
    (error) => error instanceof RosterValidationError
      && error.status === 400
      && error.code === 'DUPLICATE_ROSTER_PROGRAM'
      && /mismo programa/u.test(error.message)
  );

  assert.throws(
    () => validateRosterPayload(payload([
      record({ seat:'AA-1' }),
      record({ orderNumber:'ORD-999',seat:'AA 1' })
    ],expectedTotals(2,2,0,0))),
    (error) => error instanceof RosterValidationError
      && error.status === 400
      && error.code === 'DUPLICATE_PHYSICAL_SEAT'
      && /misma butaca física/u.test(error.message)
  );
});

test('valida segmentos y coteja los totales esperados sin exponer valores personales',() => {
  const privateValue = 'valor-que-no-debe-aparecer';
  assert.throws(
    () => validateRosterPayload(payload([
      record({ holderName:privateValue,segment:'PALCO' })
    ])),
    (error) => error.status === 400
      && error.code === 'INVALID_ROSTER_SEGMENT'
      && !error.message.includes(privateValue)
  );

  assert.throws(
    () => validateRosterPayload(payload([record()],expectedTotals(2,2,0,0))),
    (error) => error.status === 400
      && error.code === 'ROSTER_TOTAL_MISMATCH'
      && /total esperado/u.test(error.message)
  );

  assert.throws(
    () => validateRosterPayload(payload([record()],expectedTotals(1,0,1,0))),
    (error) => error.status === 400
      && error.code === 'ROSTER_TOTAL_MISMATCH'
      && /segmento VIP/u.test(error.message)
  );
});

test('exige campos canónicos, fecha ISO con zona y temporada uniforme',() => {
  for (const [change,field] of [
    [{ holderName:'  ' },'holderName'],
    [{ sourceEvent:null },'sourceEvent'],
    [{ purchasedAt:'01/09/2026 12:00' },'purchasedAt'],
    [{ holderEmail:'correo-invalido' },'holderEmail'],
    [{ seasonCode:'LMP-OTRA' },'seasonCode']
  ]) {
    assert.throws(
      () => validateRosterPayload(payload([record(change)])),
      (error) => error.status === 400 && error.field === field
    );
  }
});

test('limita la carga inicial a mil programas',() => {
  const records = Array.from({ length: MAX_ROSTER_PROGRAMS + 1 },(_,index) => record({
    orderNumber: `ORD-${index}`,
    seat: String(index)
  }));
  assert.throws(
    () => validateRosterPayload(payload(
      records,
      expectedTotals(MAX_ROSTER_PROGRAMS,MAX_ROSTER_PROGRAMS,0,0)
    )),
    (error) => error.status === 400
      && error.code === 'INVALID_ROSTER_SIZE'
      && error.field === 'records'
  );
});
