import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySegment,parseSegments } from '../src/segments.js';

test('clasifica todos los alias comerciales del PDF',() => {
  const cases = [
    ['VIP','VIP'],
    ['VIP Lateral','VIP'],
    ['Premiere 1ra - 3ra','PREFERENTE'],
    ['Premier 1ra-3ra','PREFERENTE'],
    ['Planta Baja Central','PREFERENTE'],
    ['Lateral Premiere 1ra - 3ra','PREFERENTE'],
    ['Butaca Preferente 1ra - 3ra','PREFERENTE'],
    ['Planta Baja 1ra - 3ra','PREFERENTE'],
    ['Lateral Preferente 1ra - 3ra','GENERAL'],
    ['Lateral 1ra - 3ra','GENERAL'],
    ['Planta Alta','GENERAL'],
    ['Planta Alta 1ra - 3ra','GENERAL']
  ];
  for (const [zone,expected] of cases) assert.equal(classifySegment(zone),expected,zone);
});

test('usa el producto segmentado solo como respaldo y normaliza filtros',() => {
  assert.equal(classifySegment('Localidad nueva','Charros de Jalisco: Abono General Charros LMP 2026-2027'),'GENERAL');
  assert.equal(classifySegment('Localidad nueva','Charros de Jalisco: Abono Charros LMP 2026-2027'),null);
  assert.deepEqual(parseSegments('vip, PREFERENTE,vip,invalido'),['VIP','PREFERENTE']);
});
