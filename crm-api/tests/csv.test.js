import test from 'node:test';
import assert from 'node:assert/strict';
import { rowsToCsv } from '../src/lib/csv.js';

test('escapa CSV y neutraliza fórmulas de hoja de cálculo', () => {
  const csv = rowsToCsv(
    [{ name: '=HYPERLINK("bad")', note: 'uno,dos' }],
    [{ key: 'name', label: 'Nombre' }, { key: 'note', label: 'Nota' }]
  );
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /"uno,dos"/);
  assert.ok(csv.startsWith('\uFEFF'));
});
