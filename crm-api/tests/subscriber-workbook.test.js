import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { subscriberWorkbookBuffer } from '../src/lib/subscriberWorkbook.js';

test('genera un XLSX con titulares y una fila por butaca', async () => {
  const buffer = await subscriberWorkbookBuffer({
    holders: [{
      contact_id: 'contact-1', name: 'Persona', email: 'persona@example.com', phone: '3312345678',
      subscriber_status: 'current_subscriber', counts_as_identified_holder: 'Si', executive_name: 'EJECUTIVO',
      segment: 'General', locality: 'LATERAL', seat_count: 2, seats: 'A-1 | A-2',
      membership_status: 'active', orders: '260001', last_sale_at: '2026-09-02T12:00:00.000Z'
    }],
    seats: [
      { order_number: '260001', order_status: 'reserved', sale_type: 'renewal', contact_id: 'contact-1',
        name: 'Persona', email: 'persona@example.com', phone: '3312345678', is_primary: true,
        segment: 'General', locality: 'LATERAL', unit_number: 1, seat_identifier: 'A-1', jersey_size: 'M',
        seat_personalization: 'CARLOS', executive_name: 'EJECUTIVO', sold_at: '2026-09-02T12:00:00.000Z',
        source: 'crm', holder_assignment_id: 'assignment-1' },
      { order_number: '260001', order_status: 'reserved', sale_type: 'renewal', contact_id: 'contact-1',
        name: 'Persona', is_primary: true, segment: 'General', locality: 'LATERAL', unit_number: 2,
        seat_identifier: 'A-2', source: 'crm', holder_assignment_id: 'assignment-1' }
    ]
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Titulares', 'Butacas']);
  const seats = workbook.getWorksheet('Butacas');
  assert.equal(seats.rowCount, 3);
  assert.equal(seats.getRow(2).getCell(8).value, 'GRAL');
  assert.equal(seats.getRow(2).getCell(12).value, 'M');
  assert.equal(seats.getRow(2).getCell(13).value, 'CARLOS');
  assert.equal(seats.getRow(2).getCell(2).value, 'APARTADA');
});
