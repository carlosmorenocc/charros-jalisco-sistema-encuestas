import test from 'node:test';
import assert from 'node:assert/strict';
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

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve,milliseconds));

async function listen(app,t) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0,'127.0.0.1',() => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

class AsyncMutex {
  constructor() {
    this.tail = Promise.resolve();
  }

  async acquire() {
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => { release = resolve; });
    await previous;
    return release;
  }
}

function concurrentDeliveryPool({ activeDelivery=null }={}) {
  const usersByDigest = new Map();
  for (let index = 1; index <= 5; index += 1) {
    const session = `session-${index}`;
    const csrf = `csrf-${index}`;
    usersByDigest.set(digest(session,config.sessionKey),{
      id:`00000000-0000-4000-8000-00000000000${index}`,
      email:`operador${index}@charrosdejalisco.com`,
      display_name:`Operador ${index}`,
      role:'operator',
      must_change_password:false,
      session_id:`10000000-0000-4000-8000-00000000000${index}`,
      csrf_digest:digest(csrf,config.sessionKey)
    });
  }

  const state = {
    activeDelivery,
    inserted:0,
    reversed:0,
    auditRecords:0,
    programLocks:0
  };
  const mutex = new AsyncMutex();
  const pool = {
    async query(sql,params=[]) {
      if (sql.includes('SELECT u.*,s.id session_id')) {
        const user = usersByDigest.get(params[0]);
        return { rowCount:user ? 1 : 0,rows:user ? [user] : [] };
      }
      if (sql.includes('UPDATE rewards_sessions')) return { rowCount:1,rows:[] };
      throw new Error(`Consulta fuera de transacción inesperada: ${sql}`);
    },
    async connect() {
      let releaseProgramLock = null;
      return {
        async query(sql,params=[]) {
          if (sql === 'BEGIN') return { rowCount:null,rows:[] };
          if (sql === 'COMMIT' || sql === 'ROLLBACK') {
            releaseProgramLock?.();
            releaseProgramLock = null;
            return { rowCount:null,rows:[] };
          }
          if (sql.includes('FROM rewards_programs') && sql.includes('FOR UPDATE')) {
            releaseProgramLock = await mutex.acquire();
            state.programLocks += 1;
            return { rowCount:1,rows:[{ id:'program-1' }] };
          }
          if (sql.includes('FROM rewards_catalog')) {
            return { rowCount:1,rows:[{ milestone:2 }] };
          }
          if (sql.includes('count(DISTINCT game_id)')) {
            return { rowCount:1,rows:[{ visits:3 }] };
          }
          if (sql.includes('INSERT INTO rewards_deliveries')) {
            const wasEmpty = state.activeDelivery === null;
            await wait(8);
            if (!wasEmpty) return { rowCount:0,rows:[] };
            state.inserted += 1;
            state.activeDelivery = {
              id:'20000000-0000-4000-8000-000000000001',
              program_id:params[0],
              milestone:params[1],
              status:params[2],
              recipient_name:params[8],
              delivered_by:params[4],
              known_date:params[5],
              reason:params[6],
              idempotency_key:params[7]
            };
            return { rowCount:1,rows:[state.activeDelivery] };
          }
          if (sql.includes('FROM rewards_deliveries') && sql.includes('idempotency_key')) {
            const matches = state.activeDelivery
              && state.activeDelivery.delivered_by === params[0]
              && state.activeDelivery.idempotency_key === params[1];
            return { rowCount:matches ? 1 : 0,rows:matches ? [state.activeDelivery] : [] };
          }
          if (sql.includes('FROM rewards_deliveries') && sql.includes('ORDER BY COALESCE')) {
            return {
              rowCount:state.activeDelivery ? 1 : 0,
              rows:state.activeDelivery ? [{ id:state.activeDelivery.id }] : []
            };
          }
          if (sql.includes('FROM rewards_deliveries') && sql.includes('FOR UPDATE')) {
            const matches = state.activeDelivery
              && state.activeDelivery.program_id === params[0]
              && state.activeDelivery.milestone === params[1]
              && state.activeDelivery.id === params[2];
            await wait(8);
            return { rowCount:matches ? 1 : 0,rows:matches ? [state.activeDelivery] : [] };
          }
          if (sql.includes('UPDATE rewards_deliveries')) {
            if (!state.activeDelivery || state.activeDelivery.id !== params[2]) {
              return { rowCount:0,rows:[] };
            }
            state.activeDelivery = null;
            state.reversed += 1;
            return { rowCount:1,rows:[] };
          }
          if (sql.includes('INSERT INTO rewards_audit')) {
            state.auditRecords += 1;
            return { rowCount:1,rows:[] };
          }
          throw new Error(`Consulta transaccional inesperada: ${sql}`);
        },
        release() {
          releaseProgramLock?.();
          releaseProgramLock = null;
        }
      };
    }
  };
  return { pool,state };
}

const requestHeaders = (index) => ({
  cookie:`${SESSION_COOKIE}=session-${index}; ${CSRF_COOKIE}=csrf-${index}`,
  'x-csrf-token':`csrf-${index}`,
  'content-type':'application/json',
  'idempotency-key':`30000000-0000-4000-8000-00000000000${index}`
});

test('cinco usuarios concurrentes registran exactamente una entrega activa',async(t) => {
  const { pool,state } = concurrentDeliveryPool();
  const base = await listen(createApp({ pool,config }),t);
  const responses = await Promise.all([1,2,3,4,5].map((index) => fetch(
    `${base}/api/programs/program-1/deliveries`,
    {
      method:'POST',
      headers:requestHeaders(index),
      body:JSON.stringify({
        milestone:2,
        recipientName:`Persona ${index}`,
        expectedLatestDeliveryId:null
      })
    }
  )));
  const statuses = responses.map((response) => response.status).sort((left,right) => left - right);
  assert.deepEqual(statuses,[201,409,409,409,409]);
  assert.equal(state.inserted,1);
  assert.equal(state.auditRecords,1);
  assert.equal(state.programLocks,5);
  assert.equal(state.activeDelivery?.status,'delivered');
});

test('cinco correcciones concurrentes revierten una sola vez la versión esperada',async(t) => {
  const deliveryId = '20000000-0000-4000-8000-000000000001';
  const { pool,state } = concurrentDeliveryPool({
    activeDelivery:{ id:deliveryId,program_id:'program-1',milestone:2,status:'delivered' }
  });
  const base = await listen(createApp({ pool,config }),t);
  const responses = await Promise.all([1,2,3,4,5].map((index) => fetch(
    `${base}/api/programs/program-1/deliveries/2`,
    {
      method:'DELETE',
      headers:requestHeaders(index),
      body:JSON.stringify({ deliveryId,reason:`Corrección ${index}` })
    }
  )));
  const statuses = responses.map((response) => response.status).sort((left,right) => left - right);
  assert.deepEqual(statuses,[204,409,409,409,409]);
  assert.equal(state.reversed,1);
  assert.equal(state.auditRecords,1);
  assert.equal(state.programLocks,5);
  assert.equal(state.activeDelivery,null);
});
