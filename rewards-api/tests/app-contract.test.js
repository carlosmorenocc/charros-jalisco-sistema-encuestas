import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createApp,projectCurrentDeliveryHistory } from '../src/app.js';
import { digest,hashPassword } from '../src/security.js';

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

test('cinco usuarios pueden iniciar sesión correctamente desde la misma red',async(t) => {
  const password = 'Contraseña-operativa-2026';
  const passwordHash = await hashPassword(password,config.passwordPepper);
  const pool = {
    async query(sql,params=[]) {
      if (sql.includes('SELECT * FROM rewards_users')) {
        const email = params[0];
        return { rowCount:1,rows:[{
          id:`user-${email}`,
          email,
          display_name:email.split('@')[0],
          role:'operator',
          must_change_password:false,
          active:true,
          password_hash:passwordHash
        }] };
      }
      if (sql.includes('INSERT INTO rewards_sessions')) return { rowCount:1,rows:[] };
      throw new Error(`Consulta inesperada: ${sql}`);
    }
  };
  const base = await listen(createApp({ pool,config }),t);
  for (let index = 1; index <= 5; index += 1) {
    const response = await fetch(`${base}/api/auth/login`,{
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ email:`operador${index}@charrosdejalisco.com`,password })
    });
    assert.equal(response.status,200);
    await response.json();
  }
});

test('el sexto intento fallido de la misma cuenta y red se bloquea temporalmente',async(t) => {
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT * FROM rewards_users')) return { rowCount:0,rows:[] };
      throw new Error(`Consulta inesperada: ${sql}`);
    }
  };
  const base = await listen(createApp({ pool,config }),t);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(`${base}/api/auth/login`,{
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ email:'cuenta@charrosdejalisco.com',password:'incorrecta' })
    });
    assert.equal(response.status,401);
    await response.json();
  }
  const blocked = await fetch(`${base}/api/auth/login`,{
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ email:'cuenta@charrosdejalisco.com',password:'incorrecta' })
  });
  assert.equal(blocked.status,429);
  assert.match((await blocked.json()).error,/esta cuenta/i);
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

test('el detalle usa un solo snapshot y expone una sola versión vigente por hito',async(t) => {
  const calls = [];
  const pool = {
    async query(sql) {
      calls.push(sql);
      if (['BEGIN','COMMIT','ROLLBACK'].includes(sql)
          || sql === 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY') {
        return { rowCount:null,rows:[] };
      }
      if (sql.includes('SELECT u.*,s.id session_id')) return { rowCount:1,rows:[authenticatedUser()] };
      if (sql.includes('UPDATE rewards_sessions')) return { rowCount:1,rows:[] };
      if (sql.includes('SELECT p.id,p.season_code')) {
        return {
          rowCount:1,
          rows:[{ id:'program-1',season_code:'LMP-2026-27',order_number:'100',visits:5 }]
        };
      }
      if (sql.includes('FROM rewards_catalog c') && sql.includes('LEFT JOIN rewards_deliveries d')) {
        return { rowCount:2,rows:[
          {
            milestone:2,benefit:'Beneficio 2',benefit_type:'direct',delivery_id:'delivery-active',
            status:'delivered',recipient_name:'Titular del abono',delivered_at:'2026-10-22T18:00:00.000Z',
            known_date:true,reason:null,delivered_by:'user-1',delivered_by_name:'Operador'
          },
          {
            milestone:4,benefit:'Beneficio 4',benefit_type:'direct',delivery_id:'delivery-4-current',
            status:'delivered',recipient_name:'Destinatario corregido',delivered_at:'2026-10-13T18:00:00.000Z',
            known_date:true,reason:null,delivered_by:'user-3',delivered_by_name:'Operador final'
          }
        ] };
      }
      if (sql.includes('p.order_number=$1')) {
        return { rowCount:1,rows:[{ id:'program-1',segment:'GENERAL',zone:'Zona',section:'1',seat:'A-1',visits:5 }] };
      }
      if (sql.includes('JOIN rewards_games g')) {
        return { rowCount:1,rows:[{ sequence_number:1,display_name:'Juego 1',played_on:'2026-10-13' }] };
      }
      if (sql.includes('FROM rewards_deliveries d')) {
        return { rowCount:5,rows:[
          {
            id:'delivery-active',milestone:2,benefit:'Beneficio 2',benefit_type:'direct',
            status:'delivered',recipient_name:'Titular del abono',delivered_at:'2026-10-22T18:00:00.000Z',
            known_date:true,reason:null,delivered_by:'user-1',delivered_by_name:'Operador',
            reversed_at:null,reversed_by:null,reversed_by_name:null,reversal_reason:null,
            created_at:'2026-10-22T18:00:00.000Z'
          },
          {
            id:'delivery-4-old',milestone:4,benefit:'Beneficio 4',benefit_type:'direct',
            status:'reversed',recipient_name:'Familiar autorizado',delivered_at:'2026-10-21T18:00:00.000Z',
            known_date:true,reason:null,delivered_by:'user-1',delivered_by_name:'Operador',
            reversed_at:'2026-10-21T19:00:00.000Z',reversed_by:'user-2',
            reversed_by_name:'Administración',reversal_reason:'Primera corrección',
            created_at:'2026-10-20T18:00:00.000Z'
          },
          {
            id:'delivery-4-wrong',milestone:4,benefit:'Beneficio 4',benefit_type:'direct',
            status:'reversed',recipient_name:'Destinatario incorrecto',delivered_at:'2026-10-22T18:00:00.000Z',
            known_date:true,reason:null,delivered_by:'user-2',delivered_by_name:'Administración',
            reversed_at:'2026-10-23T18:00:00.000Z',reversed_by:'user-3',
            reversed_by_name:'Operador final',reversal_reason:'Segunda corrección',
            created_at:'2026-10-22T18:00:00.000Z'
          },
          {
            id:'delivery-4-current',milestone:4,benefit:'Beneficio 4',benefit_type:'direct',
            status:'delivered',recipient_name:'Destinatario corregido',delivered_at:'2026-10-13T18:00:00.000Z',
            known_date:true,reason:null,delivered_by:'user-3',delivered_by_name:'Operador final',
            reversed_at:null,reversed_by:null,reversed_by_name:null,reversal_reason:null,
            created_at:'2026-10-24T18:00:00.000Z'
          },
          {
            id:'delivery-legacy',milestone:6,benefit:'Beneficio 6',benefit_type:'direct',
            status:'historical_unreviewed',recipient_name:null,delivered_at:null,
            known_date:false,reason:'Registro anterior',delivered_by:'user-1',delivered_by_name:'Operador',
            reversed_at:null,reversed_by:null,reversed_by_name:null,reversal_reason:null,
            created_at:'2026-10-20T18:00:00.000Z'
          }
        ] };
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    },
    async connect() {
      return { query:(...args) => pool.query(...args),release() {} };
    }
  };
  const base = await listen(createApp({ pool,config }),t);
  const response = await fetch(`${base}/api/programs/program-1`,{
    headers:{ cookie:`${SESSION_COOKIE}=session-token` }
  });
  assert.equal(response.status,200);
  const body = await response.json();
  assert.equal(body.rewards.length,2);
  assert.equal(body.deliveries.length,2);
  assert.equal(body.deliveryHistory.length,3);
  const milestoneFour = body.deliveryHistory.find((delivery) => delivery.milestone === 4);
  assert.equal(milestoneFour.id,'delivery-4-current');
  assert.equal(milestoneFour.status,'delivered');
  assert.equal(milestoneFour.recipientName,'Destinatario corregido');
  assert.equal(milestoneFour.versionCount,3);
  assert.equal(milestoneFour.correctionCount,2);
  assert.equal(milestoneFour.lastChangedAt,'2026-10-24T18:00:00.000Z');
  assert.equal(body.deliveryHistory.find((delivery) => delivery.milestone === 6).recipientName,null);
  const historyQuery = calls.find((sql) => sql.includes('FROM rewards_deliveries d'));
  assert.match(historyQuery,/reversed_user\.display_name reversed_by_name/u);
  assert.match(historyQuery,/\(d\.status<>'reversed'\) DESC/u);
  assert.match(historyQuery,/d\.created_at DESC,d\.id DESC/u);
  assert.ok(calls.indexOf('BEGIN') < calls.indexOf('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'));
  assert.ok(calls.indexOf('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY') < calls.indexOf('COMMIT'));
});

test('la proyección conserva solo la corrección más reciente cuando no hay entrega activa',() => {
  const common = {
    milestone:2,benefit:'Beneficio 2',benefit_type:'direct',status:'reversed',
    known_date:true,reason:null,delivered_by:'user-1',delivered_by_name:'Operador',
    reversed_by:'user-2',reversed_by_name:'Supervisor'
  };
  const result = projectCurrentDeliveryHistory([
    {
      ...common,id:'10000000-0000-4000-8000-000000000001',recipient_name:'Primera persona',
      delivered_at:'2026-10-20T12:00:00.000Z',created_at:'2026-10-20T12:00:00.000Z',
      reversed_at:'2026-10-21T12:00:00.000Z',reversal_reason:'Primera corrección'
    },
    {
      ...common,id:'20000000-0000-4000-8000-000000000002',recipient_name:'Segunda persona',
      delivered_at:'2026-10-22T12:00:00.000Z',created_at:'2026-10-22T12:00:00.000Z',
      reversed_at:'2026-10-23T12:00:00.000Z',reversal_reason:'Corrección definitiva'
    }
  ]);
  assert.equal(result.length,1);
  assert.equal(result[0].id,'20000000-0000-4000-8000-000000000002');
  assert.equal(result[0].recipientName,'Segunda persona');
  assert.equal(result[0].versionCount,2);
  assert.equal(result[0].correctionCount,2);
  assert.equal(result[0].lastChangedAt,'2026-10-23T12:00:00.000Z');
});

test('un operador puede revertir una entrega y la corrección queda auditada',async(t) => {
  const csrfToken = 'csrf-token';
  const deliveryId = '10000000-0000-4000-8000-000000000001';
  const transactionQueries = [];
  const client = {
    async query(sql,params=[]) {
      transactionQueries.push({ sql,params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount:null,rows:[] };
      if (sql.includes('FROM rewards_programs') && sql.includes('FOR UPDATE')) {
        return { rowCount:1,rows:[{ id:'program-1' }] };
      }
      if (sql.includes('FROM rewards_deliveries') && sql.includes('FOR UPDATE')) {
        return { rowCount:1,rows:[{ id:deliveryId,program_id:'program-1',milestone:4 }] };
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
    body:JSON.stringify({ reason:'Corrección operativa desde el perfil del abonado',deliveryId })
  });
  assert.equal(response.status,204);
  assert.ok(transactionQueries.some((call) => call.sql.includes("SET status='reversed'")));
  assert.ok(transactionQueries.some((call) => call.sql.includes('id=$3') && call.params[2] === deliveryId));
  assert.ok(transactionQueries.some((call) => call.sql.includes("'delivery.reversed'")));
  assert.equal(transactionQueries.at(-1).sql,'COMMIT');
});

test('una corrección de cliente antiguo sin deliveryId se rechaza sin tocar la base',async(t) => {
  const csrfToken = 'csrf-token';
  let connections = 0;
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT u.*,s.id session_id')) return { rowCount:1,rows:[authenticatedUser(csrfToken)] };
      if (sql.includes('UPDATE rewards_sessions')) return { rowCount:1,rows:[] };
      throw new Error(`Consulta inesperada: ${sql}`);
    },
    async connect() {
      connections += 1;
      throw new Error('No debe abrir una transacción sin precondición de versión');
    }
  };
  const base = await listen(createApp({ pool,config }),t);
  const response = await fetch(`${base}/api/programs/program-1/deliveries/4`,{
    method:'DELETE',
    headers:{
      cookie:`${SESSION_COOKIE}=session-token; ${CSRF_COOKIE}=${csrfToken}`,
      'x-csrf-token':csrfToken,
      'content-type':'application/json'
    },
    body:JSON.stringify({ reason:'Intento desde una vista anterior' })
  });
  assert.equal(response.status,409);
  assert.match((await response.json()).error,/actualiza el perfil/i);
  assert.equal(connections,0);
});

test('una corrección obsoleta no revierte una reentrega creada por otra sesión',async(t) => {
  const csrfToken = 'csrf-token';
  const staleDeliveryId = '10000000-0000-4000-8000-000000000001';
  const transactionQueries = [];
  const client = {
    async query(sql,params=[]) {
      transactionQueries.push({ sql,params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount:null,rows:[] };
      if (sql.includes('FROM rewards_programs') && sql.includes('FOR UPDATE')) {
        return { rowCount:1,rows:[{ id:'program-1' }] };
      }
      if (sql.includes('FROM rewards_deliveries') && sql.includes('FOR UPDATE')) {
        assert.equal(params[2],staleDeliveryId);
        return { rowCount:0,rows:[] };
      }
      throw new Error(`Consulta inesperada: ${sql}`);
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
    body:JSON.stringify({ reason:'Corrección desde vista obsoleta',deliveryId:staleDeliveryId })
  });
  assert.equal(response.status,409);
  assert.match((await response.json()).error,/otra sesión/i);
  assert.equal(transactionQueries.at(-1).sql,'ROLLBACK');
  assert.equal(transactionQueries.some((call) => call.sql.includes('UPDATE rewards_deliveries')),false);
  assert.equal(transactionQueries.some((call) => call.sql.includes('INSERT INTO rewards_audit')),false);
});

test('una entrega obsoleta no revive un hito corregido por otra sesión (ABA)',async(t) => {
  const csrfToken = 'csrf-token';
  const latestCorrectedId = '40000000-0000-4000-8000-000000000004';
  const transactionQueries = [];
  const client = {
    async query(sql,params=[]) {
      transactionQueries.push({ sql,params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount:null,rows:[] };
      if (sql.includes('FROM rewards_programs') && sql.includes('FOR UPDATE')) {
        return { rowCount:1,rows:[{ id:'program-1' }] };
      }
      if (sql.includes('FROM rewards_deliveries') && sql.includes('idempotency_key')) {
        return { rowCount:0,rows:[] };
      }
      if (sql.includes('FROM rewards_deliveries') && sql.includes('ORDER BY COALESCE')) {
        return { rowCount:1,rows:[{ id:latestCorrectedId }] };
      }
      throw new Error(`Consulta inesperada: ${sql}`);
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
  const response = await fetch(`${base}/api/programs/program-1/deliveries`,{
    method:'POST',
    headers:{
      cookie:`${SESSION_COOKIE}=session-token; ${CSRF_COOKIE}=${csrfToken}`,
      'x-csrf-token':csrfToken,
      'content-type':'application/json',
      'idempotency-key':'50000000-0000-4000-8000-000000000005'
    },
    body:JSON.stringify({
      milestone:2,
      recipientName:'Persona desde vista anterior',
      expectedLatestDeliveryId:null
    })
  });
  assert.equal(response.status,409);
  assert.match((await response.json()).error,/otra sesión/i);
  assert.equal(transactionQueries.at(-1).sql,'ROLLBACK');
  assert.equal(transactionQueries.some((call) => call.sql.includes('INSERT INTO rewards_deliveries')),false);
});

test('un cliente antiguo sin versión esperada no puede crear una entrega nueva',async(t) => {
  const csrfToken = 'csrf-token';
  const transactionQueries = [];
  const client = {
    async query(sql,params=[]) {
      transactionQueries.push({ sql,params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount:null,rows:[] };
      if (sql.includes('FROM rewards_programs') && sql.includes('FOR UPDATE')) {
        return { rowCount:1,rows:[{ id:'program-1' }] };
      }
      if (sql.includes('FROM rewards_deliveries') && sql.includes('idempotency_key')) {
        return { rowCount:0,rows:[] };
      }
      throw new Error(`Consulta inesperada: ${sql}`);
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
  const response = await fetch(`${base}/api/programs/program-1/deliveries`,{
    method:'POST',
    headers:{
      cookie:`${SESSION_COOKIE}=session-token; ${CSRF_COOKIE}=${csrfToken}`,
      'x-csrf-token':csrfToken,
      'content-type':'application/json'
    },
    body:JSON.stringify({ milestone:2,recipientName:'Persona autorizada' })
  });
  assert.equal(response.status,409);
  assert.match((await response.json()).error,/actualiza el perfil/i);
  assert.equal(transactionQueries.at(-1).sql,'ROLLBACK');
  assert.equal(transactionQueries.some((call) => call.sql.includes('ORDER BY COALESCE')),false);
  assert.equal(transactionQueries.some((call) => call.sql.includes('INSERT INTO rewards_deliveries')),false);
});

async function postDeliveryAtVisits(t,visits,{
  historical=false,
  role='operator',
  recipientName='Persona autorizada',
  payload={}
}={}) {
  const csrfToken = 'csrf-token';
  const transactionQueries = [];
  const client = {
    async query(sql,params=[]) {
      transactionQueries.push({ sql,params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount:null,rows:[] };
      if (sql.includes('FROM rewards_programs') && sql.includes('FOR UPDATE')) {
        return { rowCount:1,rows:[{ id:'program-1' }] };
      }
      if (sql.includes('FROM rewards_deliveries') && sql.includes('idempotency_key')) {
        return { rowCount:0,rows:[] };
      }
      if (sql.includes('FROM rewards_deliveries') && sql.includes('ORDER BY COALESCE')) {
        return { rowCount:0,rows:[] };
      }
      if (sql.includes('FROM rewards_catalog')) return { rowCount:1,rows:[{ milestone:2 }] };
      if (sql.includes('count(DISTINCT game_id)')) return { rowCount:1,rows:[{ visits }] };
      if (sql.includes('INSERT INTO rewards_deliveries')) {
        return {
          rowCount:1,
          rows:[{
            id:'delivery-1',program_id:'program-1',milestone:2,status:'delivered',
            recipient_name:params[8]
          }]
        };
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
    body:JSON.stringify({
      milestone:2,
      historical,
      unknownDate:historical,
      recipientName,
      expectedLatestDeliveryId:null,
      ...payload
    })
  });
  return { response,transactionQueries };
}

test('la entrega exige un destinatario válido antes de abrir una transacción',async(t) => {
  const csrfToken = 'csrf-token';
  let connections = 0;
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT u.*,s.id session_id')) {
        return { rowCount:1,rows:[authenticatedUser(csrfToken,'administrator')] };
      }
      if (sql.includes('UPDATE rewards_sessions')) return { rowCount:1,rows:[] };
      throw new Error(`Consulta inesperada: ${sql}`);
    },
    async connect() {
      connections += 1;
      throw new Error('No debe abrir transacción con un destinatario inválido');
    }
  };
  const base = await listen(createApp({ pool,config }),t);
  const cases = [
    { body:{ milestone:2 },error:/obligatorio/i },
    { body:{ milestone:2,recipientName:'   ' },error:/obligatorio/i },
    { body:{ milestone:2,recipientName:'A'.repeat(121) },error:/120 caracteres/i },
    { body:{ milestone:2,recipientName:'Nombre\tno válido' },error:/no permitidos/i },
    { body:{ milestone:2,historical:true,unknownDate:true },error:/obligatorio/i }
  ];
  for (const scenario of cases) {
    const response = await fetch(`${base}/api/programs/program-1/deliveries`,{
      method:'POST',
      headers:{
        cookie:`${SESSION_COOKIE}=session-token; ${CSRF_COOKIE}=${csrfToken}`,
        'x-csrf-token':csrfToken,
        'content-type':'application/json'
      },
      body:JSON.stringify(scenario.body)
    });
    assert.equal(response.status,400);
    assert.match((await response.json()).error,scenario.error);
  }
  assert.equal(connections,0);
});

test('la entrega rechaza una llave idempotente inválida antes de abrir una transacción',async(t) => {
  const csrfToken = 'csrf-token';
  let connections = 0;
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT u.*,s.id session_id')) {
        return { rowCount:1,rows:[authenticatedUser(csrfToken)] };
      }
      if (sql.includes('UPDATE rewards_sessions')) return { rowCount:1,rows:[] };
      throw new Error(`Consulta inesperada: ${sql}`);
    },
    async connect() {
      connections += 1;
      throw new Error('No debe abrir transacción con una llave inválida');
    }
  };
  const base = await listen(createApp({ pool,config }),t);
  const response = await fetch(`${base}/api/programs/program-1/deliveries`,{
    method:'POST',
    headers:{
      cookie:`${SESSION_COOKIE}=session-token; ${CSRF_COOKIE}=${csrfToken}`,
      'x-csrf-token':csrfToken,
      'content-type':'application/json',
      'idempotency-key':'no-es-un-uuid'
    },
    body:JSON.stringify({
      milestone:2,
      recipientName:'Persona autorizada',
      expectedLatestDeliveryId:null
    })
  });
  assert.equal(response.status,400);
  assert.match((await response.json()).error,/llave de confirmación/i);
  assert.equal(connections,0);
});

test('la entrega guarda el destinatario normalizado y el actor y la fecha del servidor',async(t) => {
  const delivery = await postDeliveryAtVisits(t,3,{
    recipientName:'  Familiar autorizado  ',
    payload:{
      deliveredAt:'2000-01-01T00:00:00.000Z',
      deliveredBy:'usuario-inventado-por-el-cliente',
      unknownDate:true
    }
  });
  assert.equal(delivery.response.status,201);
  const body = await delivery.response.json();
  assert.equal(body.recipientName,'Familiar autorizado');
  const insert = delivery.transactionQueries.find((call) => call.sql.includes('INSERT INTO rewards_deliveries'));
  assert.match(insert.sql,/recipient_name/u);
  assert.equal(insert.params[4],authenticatedUser().id);
  assert.ok(insert.params[3] instanceof Date);
  assert.notEqual(insert.params[3].toISOString(),'2000-01-01T00:00:00.000Z');
  assert.equal(insert.params[5],true);
  assert.equal(insert.params[8],'Familiar autorizado');
});

test('un retry con la misma llave idempotente devuelve la entrega original sin duplicar auditoría',async(t) => {
  const csrfToken = 'csrf-token';
  const idempotencyKey = '30000000-0000-4000-8000-000000000003';
  const transactionQueries = [];
  const client = {
    async query(sql,params=[]) {
      transactionQueries.push({ sql,params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount:null,rows:[] };
      if (sql.includes('FROM rewards_programs') && sql.includes('FOR UPDATE')) {
        return { rowCount:1,rows:[{ id:'program-1' }] };
      }
      if (sql.includes('FROM rewards_catalog')) return { rowCount:1,rows:[{ milestone:2 }] };
      if (sql.includes('count(DISTINCT game_id)')) return { rowCount:1,rows:[{ visits:3 }] };
      if (sql.includes('INSERT INTO rewards_deliveries')) return { rowCount:0,rows:[] };
      if (sql.includes('FROM rewards_deliveries') && sql.includes('idempotency_key')) {
        assert.deepEqual(params,[authenticatedUser().id,idempotencyKey]);
        return { rowCount:1,rows:[{
          id:'delivery-original',program_id:'program-1',milestone:2,status:'delivered',
          recipient_name:'Persona autorizada',known_date:true,reason:null,
          idempotency_key:idempotencyKey
        }] };
      }
      throw new Error(`Consulta inesperada: ${sql}`);
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
  const response = await fetch(`${base}/api/programs/program-1/deliveries`,{
    method:'POST',
    headers:{
      cookie:`${SESSION_COOKIE}=session-token; ${CSRF_COOKIE}=${csrfToken}`,
      'x-csrf-token':csrfToken,
      'content-type':'application/json',
      'idempotency-key':idempotencyKey
    },
    body:JSON.stringify({ milestone:2,recipientName:'Persona autorizada' })
  });
  assert.equal(response.status,200);
  const body = await response.json();
  assert.equal(body.id,'delivery-original');
  assert.equal(body.idempotentReplay,true);
  assert.equal(transactionQueries.some((call) => call.sql.includes('INSERT INTO rewards_audit')),false);
  assert.equal(transactionQueries.at(-1).sql,'COMMIT');

  const changedPayload = await fetch(`${base}/api/programs/program-1/deliveries`,{
    method:'POST',
    headers:{
      cookie:`${SESSION_COOKIE}=session-token; ${CSRF_COOKIE}=${csrfToken}`,
      'x-csrf-token':csrfToken,
      'content-type':'application/json',
      'idempotency-key':idempotencyKey
    },
    body:JSON.stringify({ milestone:2,recipientName:'Otra persona' })
  });
  assert.equal(changedPayload.status,409);
  assert.match((await changedPayload.json()).error,/datos diferentes/i);
  assert.equal(transactionQueries.at(-1).sql,'ROLLBACK');
});

test('la entrega histórica conserva su fecha explícita y también exige destinatario',async(t) => {
  const deliveredAt = '2026-10-14T12:30:00.000Z';
  const delivery = await postDeliveryAtVisits(t,3,{
    historical:true,
    role:'administrator',
    recipientName:'Titular del abono',
    payload:{ unknownDate:false,deliveredAt }
  });
  assert.equal(delivery.response.status,201);
  const insert = delivery.transactionQueries.find((call) => call.sql.includes('INSERT INTO rewards_deliveries'));
  assert.equal(insert.params[3].toISOString(),deliveredAt);
  assert.equal(insert.params[5],true);
  assert.equal(insert.params[8],'Titular del abono');
});

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
