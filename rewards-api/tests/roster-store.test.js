import test from 'node:test';
import assert from 'node:assert/strict';
import { persistRoster, previewRoster } from '../src/roster-store.js';

const ZERO_STATE = {
  programs:0,orders:0,holders:0,vip:0,preferente:0,general:0,
  manual_locks:0,attendance:0,deliveries:0
};

const roster = {
  seasonCode:'LMP-2026-27',
  sourceFilename:'padron-sintetico.json',
  sha256:'a'.repeat(64),
  totals:{ programs:2,orders:1,holders:1,bySegment:{ VIP:0,PREFERENTE:2,GENERAL:0 } },
  records:['B1','B2'].map((seat,index) => ({
    seasonCode:'LMP-2026-27',orderNumber:'15772800',purchaseCode:null,
    holderName:'Titular Sintetico',holderEmail:'titular@example.test',holderPhone:'0000000000',
    zone:'Lateral Premier Primera Base',section:'103',seat,barcode:null,
    sourceEvent:'Evento sintetico',segment:'PREFERENTE',seller:null,discountLabel:null,
    purchasedAt:null,paymentType:null,sourceReference:`demo-${index + 1}`
  }))
};

test('la previsualizacion solo lee agregados y detecta si el bootstrap es seguro',async() => {
  const client = { async query() { return { rows:[ZERO_STATE],rowCount:1 }; } };
  const result = await previewRoster(client,roster);
  assert.equal(result.safeToBootstrap,true);
  assert.equal(result.current.programs,0);
  assert.deepEqual(result.proposed.bySegment,{ VIP:0,PREFERENTE:2,GENERAL:0 });
});

test('la persistencia reconcilia el padron completo y deja trazabilidad agregada',async() => {
  let stateReads = 0;
  const calls = [];
  const client = {
    async query(sql,params=[]) {
      calls.push({ sql,params });
      if (sql.includes('SELECT\n      count(*) FILTER')) {
        stateReads += 1;
        return stateReads === 1
          ? { rows:[ZERO_STATE],rowCount:1 }
          : { rows:[{
            programs:2,orders:1,holders:1,vip:0,preferente:2,general:0,
            manual_locks:0,attendance:0,deliveries:0
          }],rowCount:1 };
      }
      if (sql.includes('FROM rewards_imports')) return { rows:[],rowCount:0 };
      if (sql.includes("role='administrator'")) {
        return { rows:[{ id:'00000000-0000-4000-8000-000000000001' }],rowCount:1 };
      }
      if (sql.includes('INSERT INTO rewards_holders')) {
        return { rows:[{ id:'00000000-0000-4000-8000-000000000002' }],rowCount:1 };
      }
      if (sql.includes('INSERT INTO rewards_orders')) {
        return { rows:[{ id:'00000000-0000-4000-8000-000000000003' }],rowCount:1 };
      }
      if (sql.includes('INSERT INTO rewards_programs')) {
        return { rows:[{ id:'00000000-0000-4000-8000-000000000004' }],rowCount:1 };
      }
      if (sql.includes('FROM (') && sql.includes('duplicated')) {
        return { rows:[{ total:0 }],rowCount:1 };
      }
      if (sql.includes('historical_aliases')) {
        return { rows:[{ target_programs:2,historical_aliases:2 }],rowCount:1 };
      }
      if (sql.includes('INSERT INTO rewards_imports')) {
        return { rows:[{ id:'00000000-0000-4000-8000-000000000005' }],rowCount:1 };
      }
      return { rows:[],rowCount:1 };
    }
  };

  const result = await persistRoster(client,roster,{ sourceFilename:roster.sourceFilename });
  assert.equal(result.alreadyImported,false);
  assert.equal(result.state.programs,2);
  assert.ok(calls.some(({ sql }) => sql.includes('pg_advisory_xact_lock')));
  assert.ok(calls.some(({ sql }) => sql.includes("'roster.bootstrap.confirmed'")));
  assert.equal(JSON.stringify(result).includes('titular@example.test'),false);
});

test('el bootstrap se detiene si ya existen asistencias',async() => {
  const client = {
    async query(sql) {
      if (sql.includes('FROM rewards_imports')) return { rows:[],rowCount:0 };
      if (sql.includes('SELECT\n      count(*) FILTER')) {
        return { rows:[{ ...ZERO_STATE,attendance:1 }],rowCount:1 };
      }
      return { rows:[],rowCount:1 };
    }
  };
  await assert.rejects(
    () => persistRoster(client,roster,{ sourceFilename:roster.sourceFilename }),
    (error) => error.status === 409 && /actividad/u.test(error.message)
  );
});
