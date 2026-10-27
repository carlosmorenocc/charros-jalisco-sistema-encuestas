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
  totals:{ programs:1,orders:1,holders:1,bySegment:{ VIP:1,PREFERENTE:0,GENERAL:0 } },
  records:[{
    seasonCode:'LMP-2026-27',orderNumber:'ORD-DEMO',purchaseCode:null,
    holderName:'Titular Sintetico',holderEmail:'titular@example.test',holderPhone:'0000000000',
    zone:'VIP',section:'A',seat:'1',barcode:null,sourceEvent:'Evento sintetico',segment:'VIP',
    seller:null,discountLabel:null,purchasedAt:null,paymentType:null,sourceReference:'demo-1'
  }]
};

test('la previsualizacion solo lee agregados y detecta si el bootstrap es seguro',async() => {
  const client = { async query() { return { rows:[ZERO_STATE],rowCount:1 }; } };
  const result = await previewRoster(client,roster);
  assert.equal(result.safeToBootstrap,true);
  assert.equal(result.current.programs,0);
  assert.deepEqual(result.proposed.bySegment,{ VIP:1,PREFERENTE:0,GENERAL:0 });
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
            programs:1,orders:1,holders:1,vip:1,preferente:0,general:0,
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
      if (sql.includes('INSERT INTO rewards_imports')) {
        return { rows:[{ id:'00000000-0000-4000-8000-000000000005' }],rowCount:1 };
      }
      return { rows:[],rowCount:1 };
    }
  };

  const result = await persistRoster(client,roster,{ sourceFilename:roster.sourceFilename });
  assert.equal(result.alreadyImported,false);
  assert.equal(result.state.programs,1);
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
