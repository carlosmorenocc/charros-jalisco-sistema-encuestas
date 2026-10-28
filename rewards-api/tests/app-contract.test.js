import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createApp } from '../src/app.js';
import { digest } from '../src/security.js';

const SESSION_COOKIE = 'charros_rewards_session';
const CSRF_COOKIE = 'charros_rewards_csrf';
const config = {
  corsOrigin:'http://localhost:4174',
  cookieSecure:false,
  cookieSameSite:'lax',
  sessionKey:'session-key-for-tests-with-32-characters',
  passwordPepper:'password-pepper-for-tests-32-characters'
};

async function listen(app,t) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0,'127.0.0.1',() => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function authenticatedUser(csrfToken='csrf-token',role='operator') {
  return {
    id:'00000000-0000-4000-8000-000000000001',
    email:'operador@charrosdejalisco.com',
    display_name:'Operador',
    role,
    must_change_password:false,
    session_id:'00000000-0000-4000-8000-000000000002',
    csrf_digest:digest(csrfToken,config.sessionKey)
  };
}

async function accessWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Hoja 1');
  sheet.addRow(['Reporte de Historial de Accesos']);
  sheet.addRow([]);
  sheet.addRow([
    'INGRESO','TIPO DE REGISTRO','ZONA','SECCIÓN','ASIENTO','NOMBRE',
    'CORREO ELECTRÓNICO','TELÉFONO','TIPO','COMPRA','CÓDIGO DE BARRAS',
    'PARÁMETRO','PATROCINADOR','DISPOSITIVO','RONDA','EVENTO LIGADO','PRECIO'
  ]);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test('el módulo HTTP carga y expone la fábrica de la aplicación',() => {
  assert.equal(typeof createApp,'function');
});

test('CORS responde únicamente a orígenes de la lista cerrada',async(t) => {
  const pool = {
    async query(sql) {
      if (sql === 'SELECT 1') return { rowCount:1,rows:[{ '?column?':1 }] };
      throw new Error(`Consulta inesperada: ${sql}`);
    }
  };
  const corsConfig = {
    ...config,
    corsOrigin:undefined,
    corsOrigins:['https://rewards.example','https://preview.example']
  };
  const base = await listen(createApp({ pool,config:corsConfig }),t);
  const allowed = await fetch(`${base}/ready`,{ headers:{ origin:'https://preview.example' } });
  const rejected = await fetch(`${base}/ready`,{ headers:{ origin:'https://otro.example' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'),'https://preview.example');
  assert.equal(rejected.headers.get('access-control-allow-origin'),null);
});

test('lista abonados con filtros OR, total real y paginación',async(t) => {
  const calls = [];
  const pool = {
    async query(sql,params=[]) {
      calls.push({ sql,params });
      if (sql.includes('SELECT u.*,s.id session_id')) return { rowCount:1,rows:[authenticatedUser()] };
      if (sql.includes('UPDATE rewards_sessions')) return { rowCount:1,rows:[] };
      if (sql.includes('WITH filtered AS')) return {
        rowCount:1,
        rows:[{ total:604,items:[{
          id:'program-1',holder_name:'Titular',holder_email:'titular@example.com',holder_phone:'3312345678',
          order_number:'100',segment:'VIP',zone:'VIP',section:'100',seat:'A-1',visits:5,
          delivered_milestones:[2,4]
        }] }]
      };
      throw new Error(`Consulta inesperada: ${sql}`);
    }
  };
  const base = await listen(createApp({ pool,config }),t);
  const response = await fetch(`${base}/api/programs?segments=VIP,PREFERENTE&redeemed=2,4&page=2&pageSize=25`,{
    headers:{ cookie:`${SESSION_COOKIE}=session-token` }
  });
  assert.equal(response.status,200);
  const body = await response.json();
  assert.equal(body.total,604);
  assert.equal(body.page,2);
  assert.equal(body.pageSize,25);
  assert.deepEqual(body.items[0].delivered_milestones,[2,4]);
  const listCall = calls.find((call) => call.sql.includes('WITH filtered AS'));
  assert.deepEqual(listCall.params.slice(1,4),[['VIP','PREFERENTE'],'',[2,4]]);
  assert.deepEqual(listCall.params.slice(-2),[25,25]);
});

test('el resumen cuenta únicamente entregas activas',async(t) => {
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT u.*,s.id session_id')) return { rowCount:1,rows:[authenticatedUser()] };
      if (sql.includes('UPDATE rewards_sessions')) return { rowCount:1,rows:[] };
      if (sql.includes("count(*)::int total FROM rewards_programs")) return { rowCount:1,rows:[{ total:604 }] };
      if (sql.includes('count(*)::int total') && sql.includes('FROM rewards_attendance a')) {
        return { rowCount:1,rows:[{ total:1632 }] };
      }
      if (sql.includes('FROM rewards_deliveries d')) {
        assert.match(sql,/JOIN rewards_programs p ON p\.id=d\.program_id/);
        assert.match(sql,/p\.active/);
        assert.match(sql,/p\.eligibility_status='eligible'/);
        return { rowCount:1,rows:[{ total:7 }] };
      }
      if (sql.includes('SELECT visits,count(*)::int total')) {
        return { rowCount:1,rows:[{ visits:4,total:240 }] };
      }
      if (sql.includes('count(*) FILTER')) return { rowCount:1,rows:[{ processed:4,cutoff:null }] };
      throw new Error(`Consulta inesperada: ${sql}`);
    }
  };
  const base = await listen(createApp({ pool,config }),t);
  const response = await fetch(`${base}/api/summary`,{
    headers:{ cookie:`${SESSION_COOKIE}=session-token` }
  });
  assert.equal(response.status,200);
  const body = await response.json();
  assert.equal(body.deliveries,7);
  assert.equal(body.processedGames,4);
  assert.equal(body.historicalPending,undefined);
});

test('un operador puede revertir una entrega y la corrección queda auditada',async(t) => {
  const csrfToken = 'csrf-token';
  const transactionQueries = [];
  const client = {
    async query(sql,params=[]) {
      transactionQueries.push({ sql,params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount:null,rows:[] };
      if (sql.includes('FROM rewards_deliveries') && sql.includes('FOR UPDATE')) {
        return { rowCount:1,rows:[{ id:'delivery-1',program_id:'program-1',milestone:4 }] };
      }
      return { rowCount:1,rows:[] };
    },
    release() {}
  };
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT u.*,s.id session_id')) return { rowCount:1,rows:[authenticatedUser(csrfToken)] };
      if (sql.includes('UPDATE rewards_sessions')) return { rowCount:1,rows:[] };
      throw new Error(`Consulta inesperada: ${sql}`);
    },
    async connect() { return client; }
  };
  const base = await listen(createApp({ pool,config }),t);
  const response = await fetch(`${base}/api/programs/program-1/deliveries/4`,{
    method:'DELETE',
    headers:{
      cookie:`${SESSION_COOKIE}=session-token; ${CSRF_COOKIE}=${csrfToken}`,
      'x-csrf-token':csrfToken,
      'content-type':'application/json'
    },
    body:JSON.stringify({ reason:'Corrección operativa desde el perfil del abonado' })
  });
  assert.equal(response.status,204);
  assert.ok(transactionQueries.some((call) => call.sql.includes("SET status='reversed'")));
  assert.ok(transactionQueries.some((call) => call.sql.includes("'delivery.reversed'")));
  assert.equal(transactionQueries.at(-1).sql,'COMMIT');
});

async function postDeliveryAtVisits(t,visits,{ historical=false,role='operator' }={}) {
  const csrfToken = 'csrf-token';
  const transactionQueries = [];
  const client = {
    async query(sql,params=[]) {
      transactionQueries.push({ sql,params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount:null,rows:[] };
      if (sql.includes('FROM rewards_programs') && sql.includes('FOR UPDATE')) {
        return { rowCount:1,rows:[{ id:'program-1' }] };
      }
      if (sql.includes('FROM rewards_catalog')) return { rowCount:1,rows:[{ milestone:2 }] };
      if (sql.includes('count(DISTINCT game_id)')) return { rowCount:1,rows:[{ visits }] };
      if (sql.includes('INSERT INTO rewards_deliveries')) {
        return { rowCount:1,rows:[{ id:'delivery-1',program_id:'program-1',milestone:2,status:'delivered' }] };
      }
      if (sql.includes('INSERT INTO rewards_audit')) return { rowCount:1,rows:[] };
      throw new Error(`Consulta inesperada: ${sql}`);
    },
    release() {}
  };
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT u.*,s.id session_id')) return { rowCount:1,rows:[authenticatedUser(csrfToken,role)] };
      if (sql.includes('UPDATE rewards_sessions')) return { rowCount:1,rows:[] };
      throw new Error(`Consulta inesperada: ${sql}`);
    },
    async connect() { return client; }
  };
  const base = await listen(createApp({ pool,config }),t);
  const response = await fetch(`${base}/api/programs/program-1/deliveries`,{
    method:'POST',
    headers:{
      cookie:`${SESSION_COOKIE}=session-token; ${CSRF_COOKIE}=${csrfToken}`,
      'x-csrf-token':csrfToken,
      'content-type':'application/json'
    },
    body:JSON.stringify({ milestone:2,historical,unknownDate:historical })
  });
  return { response,transactionQueries };
}

test('el hito N se entrega únicamente desde N + 1 asistencias',async(t) => {
  const atMilestone = await postDeliveryAtVisits(t,2);
  assert.equal(atMilestone.response.status,409);
  assert.match((await atMilestone.response.json()).error,/siguiente asistencia/i);
  assert.equal(atMilestone.transactionQueries.at(-1).sql,'ROLLBACK');

  const nextGame = await postDeliveryAtVisits(t,3);
  assert.equal(nextGame.response.status,201);
  assert.equal((await nextGame.response.json()).milestone,2);
  assert.equal(nextGame.transactionQueries.at(-1).sql,'COMMIT');
});

test('una entrega histórica tampoco puede anticipar el N + 1',async(t) => {
  const historical = await postDeliveryAtVisits(t,2,{ historical:true,role:'administrator' });
  assert.equal(historical.response.status,409);
  assert.match((await historical.response.json()).error,/siguiente asistencia/i);
  assert.equal(historical.transactionQueries.at(-1).sql,'ROLLBACK');
});

test('un operador de consulta no puede registrar entregas históricas',async(t) => {
  const historical = await postDeliveryAtVisits(t,3,{ historical:true });
  assert.equal(historical.response.status,403);
  assert.match((await historical.response.json()).error,/administrador/i);
  assert.equal(historical.transactionQueries.length,0);
});

test('la API operativa rechaza importaciones que no sean de asistencias',async(t) => {
  const csrfToken = 'csrf-token';
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT u.*,s.id session_id')) {
        return { rowCount:1,rows:[authenticatedUser(csrfToken,'administrator')] };
      }
      if (sql.includes('UPDATE rewards_sessions')) return { rowCount:1,rows:[] };
      throw new Error(`Consulta inesperada: ${sql}`);
    }
  };
  const base = await listen(createApp({ pool,config }),t);
  for (const action of ['preview','confirm']) {
    const response = await fetch(`${base}/api/admin/imports/${action}?kind=sales`,{
      method:'POST',
      headers:{
        cookie:`${SESSION_COOKIE}=session-token; ${CSRF_COOKIE}=${csrfToken}`,
        'x-csrf-token':csrfToken,
        'content-type':'application/octet-stream'
      },
      body:Buffer.from('not-an-xlsx')
    });
    assert.equal(response.status,400);
    assert.match((await response.json()).error,/solo se admiten reportes de asistencias/i);
  }
});

test('la confirmación se bloquea si una asistencia requiere revisión',async(t) => {
  const csrfToken = 'csrf-token';
  let connected = false;
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT u.*,s.id session_id')) {
        return { rowCount:1,rows:[authenticatedUser(csrfToken,'administrator')] };
      }
      if (sql.includes('UPDATE rewards_sessions')) return { rowCount:1,rows:[] };
      if (sql.includes('FROM rewards_program_aliases')) return { rowCount:0,rows:[] };
      if (sql.includes('SELECT id,order_number,zone,section,seat,segment')) {
        assert.match(sql,/eligibility_exception/u);
        return { rowCount:0,rows:[] };
      }
      if (sql.includes('SELECT played_on::text played_on')) {
        return { rowCount:1,rows:[{ played_on:'2026-10-21' }] };
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    },
    async connect() { connected = true; throw new Error('No debe abrir transacción'); }
  };
  const base = await listen(createApp({ pool,config }),t);
  const event = 'Charros de Jalisco: Abono VIP Charros LMP 2026-2027';
  const body = await accessWorkbook([
    ['21/10/26 20:10','Entrada','VIP','210','A-1','Titular','-','-','Abono','123','9','-','-','D','Principal',event,'1']
  ]);
  const response = await fetch(`${base}/api/admin/imports/confirm?kind=access&gameId=game-1&reportStatus=closed`,{
    method:'POST',
    headers:{
      cookie:`${SESSION_COOKIE}=session-token; ${CSRF_COOKIE}=${csrfToken}`,
      'x-csrf-token':csrfToken,
      'content-type':'application/octet-stream'
    },
    body
  });
  assert.equal(response.status,409);
  assert.match((await response.json()).error,/requieren revisión/i);
  assert.equal(connected,false);
});

test('un corte posterior conserva en PostgreSQL el escaneo más temprano',async(t) => {
  const csrfToken = 'csrf-token';
  const transactionQueries = [];
  const client = {
    async query(sql,params=[]) {
      transactionQueries.push({ sql,params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount:null,rows:[] };
      if (sql.includes('SELECT played_on::text played_on')) {
        return { rowCount:1,rows:[{ played_on:'2026-10-21' }] };
      }
      if (sql.includes('INSERT INTO rewards_imports')) return { rowCount:1,rows:[{ id:'import-2' }] };
      if (sql.includes('INSERT INTO rewards_attendance')) return { rowCount:0,rows:[] };
      if (sql.includes('UPDATE rewards_attendance')) return { rowCount:1,rows:[{ id:'attendance-1' }] };
      if (sql.includes('UPDATE rewards_games')) return { rowCount:1,rows:[] };
      if (sql.includes('UPDATE rewards_imports SET summary')) return { rowCount:1,rows:[] };
      if (sql.includes('INSERT INTO rewards_audit')) return { rowCount:1,rows:[] };
      throw new Error(`Consulta inesperada: ${sql}`);
    },
    release() {}
  };
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT u.*,s.id session_id')) {
        return { rowCount:1,rows:[authenticatedUser(csrfToken,'administrator')] };
      }
      if (sql.includes('UPDATE rewards_sessions')) return { rowCount:1,rows:[] };
      if (sql.includes('FROM rewards_program_aliases')) return { rowCount:0,rows:[] };
      if (sql.includes('SELECT id,order_number,zone,section,seat,segment')) {
        assert.match(sql,/eligibility_exception/u);
        return { rowCount:1,rows:[{
          id:'program-1',order_number:'123',zone:'VIP',section:'210',seat:'A-1',segment:'VIP'
        }] };
      }
      if (sql.includes('SELECT played_on::text played_on')) {
        return { rowCount:1,rows:[{ played_on:'2026-10-21' }] };
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    },
    async connect() { return client; }
  };
  const base = await listen(createApp({ pool,config }),t);
  const event = 'Charros de Jalisco: Abono VIP Charros LMP 2026-2027';
  const body = await accessWorkbook([
    ['21/10/26 19:55','Entrada','VIP','210','A-1','Titular','-','-','Abono','123','9','-','-','D','Principal',event,'1']
  ]);
  const response = await fetch(`${base}/api/admin/imports/confirm?kind=access&gameId=game-1&reportStatus=partial`,{
    method:'POST',
    headers:{
      cookie:`${SESSION_COOKIE}=session-token; ${CSRF_COOKIE}=${csrfToken}`,
      'x-csrf-token':csrfToken,
      'content-type':'application/octet-stream'
    },
    body
  });
  assert.equal(response.status,201);
  const result = await response.json();
  assert.equal(result.summary.inserted,0);
  assert.equal(result.summary.alreadyCounted,1);
  assert.equal(result.summary.earlierScanUpdated,1);
  const update = transactionQueries.find((call) => call.sql.includes('UPDATE rewards_attendance'));
  assert.equal(update.params[2],'2026-10-21T19:55:00-06:00');
  assert.match(update.sql,/scanned_at>\$3/);
  assert.equal(transactionQueries.at(-1).sql,'COMMIT');
});

test('el bootstrap tecnico permanece oculto y exige su token efimero',async(t) => {
  const pool = {
    async query() { throw new Error('No debe consultar PostgreSQL'); }
  };
  const disabledBase = await listen(createApp({ pool,config }),t);
  const disabled = await fetch(`${disabledBase}/api/internal/roster-bootstrap?mode=preview`,{
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:'{}'
  });
  assert.equal(disabled.status,404);

  const enabledConfig = {
    ...config,
    rosterImportEnabled:true,
    rosterImportToken:'token-tecnico-robusto-de-prueba-123456'
  };
  const enabledBase = await listen(createApp({ pool,config:enabledConfig }),t);
  const unauthorized = await fetch(`${enabledBase}/api/internal/roster-bootstrap?mode=preview`,{
    method:'POST',
    headers:{
      authorization:'Bearer token-equivocado',
      'content-type':'application/json'
    },
    body:'{}'
  });
  assert.equal(unauthorized.status,401);

  const invalidPayload = await fetch(`${enabledBase}/api/internal/roster-bootstrap?mode=preview`,{
    method:'POST',
    headers:{
      authorization:`Bearer ${enabledConfig.rosterImportToken}`,
      'content-type':'application/json'
    },
    body:'{}'
  });
  assert.equal(invalidPayload.status,400);
});
