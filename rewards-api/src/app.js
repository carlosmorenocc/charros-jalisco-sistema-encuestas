import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit,{ ipKeyGenerator } from 'express-rate-limit';
import { digest, normalizeEmail, randomToken, verifyPassword, hashPassword } from './security.js';
import { inspectWorkbook } from './workbook.js';
import { SEGMENTS, classifySegment, parseSegments } from './segments.js';
import { transaction } from './db.js';
import { validateRosterPayload } from './roster.js';
import { persistRoster, previewRoster } from './roster-store.js';

const safeUser = (row) => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  role: row.role,
  mustChangePassword: row.must_change_password
});
const httpError = (status,message) => Object.assign(new Error(message),{ status });
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
const parseMilestones = (value) => [...new Set(String(value || '')
  .split(',')
  .map((item) => Number(item))
  .filter((item) => Number.isInteger(item) && item >= 2 && item <= 30 && item % 2 === 0))];
const MAX_RECIPIENT_NAME_LENGTH = 120;
const normalizeRecipientName = (value) => {
  if (typeof value !== 'string') {
    throw httpError(400,'El nombre de quien recibe la recompensa es obligatorio');
  }
  const recipientName = value.trim().normalize('NFC');
  if (!recipientName) {
    throw httpError(400,'El nombre de quien recibe la recompensa es obligatorio');
  }
  if ([...recipientName].length > MAX_RECIPIENT_NAME_LENGTH) {
    throw httpError(400,`El nombre de quien recibe la recompensa no puede exceder ${MAX_RECIPIENT_NAME_LENGTH} caracteres`);
  }
  if (/\p{Cc}/u.test(recipientName)) {
    throw httpError(400,'El nombre de quien recibe la recompensa contiene caracteres no permitidos');
  }
  return recipientName;
};

const deliveryVersionTimestamp = (delivery) => {
  const value = delivery.status === 'reversed'
    ? (delivery.reversed_at || delivery.created_at || delivery.delivered_at)
    : (delivery.created_at || delivery.delivered_at);
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const isNewerDeliveryVersion = (candidate,current) => {
  const candidateActive = candidate.status !== 'reversed';
  const currentActive = current.status !== 'reversed';
  if (candidateActive !== currentActive) return candidateActive;
  const timestampDifference = deliveryVersionTimestamp(candidate) - deliveryVersionTimestamp(current);
  if (timestampDifference !== 0) return timestampDifference > 0;
  return String(candidate.id).localeCompare(String(current.id)) > 0;
};

export const projectCurrentDeliveryHistory = (rows) => {
  const milestones = new Map();
  for (const delivery of rows) {
    const existing = milestones.get(delivery.milestone) || {
      current:delivery,
      versionCount:0,
      correctionCount:0
    };
    existing.versionCount += 1;
    if (delivery.status === 'reversed') existing.correctionCount += 1;
    if (isNewerDeliveryVersion(delivery,existing.current)) existing.current = delivery;
    milestones.set(delivery.milestone,existing);
  }
  return [...milestones.values()]
    .map(({ current,versionCount,correctionCount }) => ({
      id:current.id,
      milestone:current.milestone,
      benefit:current.benefit,
      benefitType:current.benefit_type,
      status:current.status,
      recipientName:current.recipient_name ?? null,
      deliveredAt:current.delivered_at,
      knownDate:current.known_date,
      reason:current.reason,
      deliveredBy:current.delivered_by,
      deliveredByName:current.delivered_by_name,
      reversedAt:current.reversed_at,
      reversedBy:current.reversed_by,
      reversedByName:current.reversed_by_name,
      reversalReason:current.reversal_reason,
      createdAt:current.created_at,
      lastChangedAt:current.status === 'reversed'
        ? (current.reversed_at || current.created_at)
        : current.created_at,
      versionCount,
      correctionCount
    }))
    .sort((left,right) => {
      const timestampDifference = new Date(right.lastChangedAt || 0).getTime()
        - new Date(left.lastChangedAt || 0).getTime();
      return timestampDifference || right.milestone - left.milestone;
    });
};

export function createApp({ pool, config }) {
  const app = express();
  const allowedOrigins = new Set(config.corsOrigins || [config.corsOrigin].filter(Boolean));
  const cookieNames = config.cookieSecure
    ? { session:'__Host-charros_rewards_session',csrf:'__Host-charros_rewards_csrf' }
    : { session:'charros_rewards_session',csrf:'charros_rewards_csrf' };
  app.disable('x-powered-by');
  app.set('trust proxy',1);
  app.use(helmet());
  app.use(cors({
    origin(origin,callback) {
      callback(null,!origin || allowedOrigins.has(origin));
    },
    credentials: true
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const sessionCookie = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/'
  };
  const csrfCookie = { ...sessionCookie, httpOnly: false };

  const authenticate = async (req,res,next) => {
    const token = req.cookies[cookieNames.session];
    if (!token) return res.status(401).json({ error: 'Sesión requerida' });
    const result = await pool.query(`
      SELECT u.*,s.id session_id,s.csrf_digest
      FROM rewards_sessions s
      JOIN rewards_users u ON u.id=s.user_id
      WHERE s.token_digest=$1
        AND s.revoked_at IS NULL
        AND s.expires_at>now()
        AND s.idle_expires_at>now()
        AND u.active
    `,[digest(token,config.sessionKey)]);
    if (!result.rowCount) return res.status(401).json({ error: 'Sesión inválida' });
    req.user = result.rows[0];
    const passwordChangeAllowed = ['/api/auth/session','/api/auth/change-password','/api/auth/logout'].includes(req.path);
    if (req.user.must_change_password && !passwordChangeAllowed) {
      return res.status(403).json({ error:'Debes crear tu contraseña antes de continuar' });
    }
    await pool.query(`
      UPDATE rewards_sessions
      SET last_seen_at=now(),idle_expires_at=LEAST(expires_at,now()+interval '45 minutes')
      WHERE id=$1
    `,[req.user.session_id]);
    next();
  };
  const csrf = (req,res,next) => {
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    const raw = req.get('x-csrf-token');
    if (!raw || raw !== req.cookies[cookieNames.csrf] || digest(raw,config.sessionKey) !== req.user.csrf_digest) {
      return res.status(403).json({ error:'Solicitud insegura rechazada' });
    }
    next();
  };
  const admin = (req,res,next) => req.user.role === 'administrator'
    ? next()
    : res.status(403).json({ error:'Permiso de administrador requerido' });

  const rosterBootstrapAuth = (req,res,next) => {
    if (!config.rosterImportEnabled) return res.status(404).json({ error:'Ruta no disponible' });
    const authorization = String(req.get('authorization') || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const expected = String(config.rosterImportToken || '');
    const providedBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expected);
    if (!token || providedBuffer.length !== expectedBuffer.length
        || !crypto.timingSafeEqual(providedBuffer,expectedBuffer)) {
      return res.status(401).json({ error:'AutorizaciÃ³n tÃ©cnica invÃ¡lida' });
    }
    next();
  };

  const loginIpLimiter = rateLimit({
    windowMs:15*60*1000,
    limit:30,
    standardHeaders:'draft-8',
    legacyHeaders:false,
    skipSuccessfulRequests:true,
    message:{ error:'Demasiados intentos fallidos desde esta red; espera 15 minutos' }
  });
  const loginAccountLimiter = rateLimit({
    windowMs:15*60*1000,
    limit:5,
    standardHeaders:'draft-8',
    legacyHeaders:false,
    skipSuccessfulRequests:true,
    keyGenerator:(req) => `${ipKeyGenerator(req.ip)}:${normalizeEmail(req.body?.email) || 'sin-correo'}`,
    message:{ error:'Demasiados intentos fallidos para esta cuenta; espera 15 minutos' }
  });

  app.get('/ready',async(_req,res) => {
    await pool.query('SELECT 1');
    res.json({ ok:true,service:'charros-rewards-api' });
  });

  app.post(
    '/api/internal/roster-bootstrap',
    rateLimit({ windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false }),
    rosterBootstrapAuth,
    async(req,res) => {
      const mode = String(req.query.mode || '');
      if (!['preview','confirm'].includes(mode)) {
        return res.status(400).json({ error:'Selecciona mode=preview o mode=confirm' });
      }
      const roster = validateRosterPayload(req.body);
      if (mode === 'preview') {
        return res.json({ ok:true,mode, ...(await previewRoster(pool,roster)) });
      }
      const result = await transaction(pool,(client) => persistRoster(client,roster,{
        sourceFilename:roster.sourceFilename
      }));
      res.status(result.alreadyImported ? 200 : 201).json({ ok:true,mode,...result,sha256:roster.sha256 });
    }
  );

  app.post('/api/auth/login',loginIpLimiter,loginAccountLimiter,async(req,res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error:'Correo y contraseña son obligatorios' });
    const result = await pool.query('SELECT * FROM rewards_users WHERE email=$1 AND active',[email]);
    const user = result.rows[0];
    if (!user || !user.password_hash || !(await verifyPassword(password,user.password_hash,config.passwordPepper))) {
      return res.status(401).json({ error:'Credenciales incorrectas' });
    }
    const token = randomToken();
    const csrfToken = randomToken();
    await pool.query(`
      INSERT INTO rewards_sessions(user_id,token_digest,csrf_digest,expires_at,idle_expires_at)
      VALUES($1,$2,$3,now()+interval '8 hours',now()+interval '45 minutes')
    `,[user.id,digest(token,config.sessionKey),digest(csrfToken,config.sessionKey)]);
    res.cookie(cookieNames.session,token,sessionCookie)
      .cookie(cookieNames.csrf,csrfToken,csrfCookie)
      .json({ user:safeUser(user),csrfToken });
  });

  app.get('/api/auth/session',authenticate,(req,res) => {
    res.json({ user:safeUser(req.user),csrfToken:req.cookies[cookieNames.csrf] });
  });

  app.post('/api/auth/change-password',authenticate,csrf,async(req,res) => {
    if (String(req.body?.password || '').length < 12) {
      return res.status(400).json({ error:'La contraseña debe contener al menos 12 caracteres' });
    }
    const passwordHash = await hashPassword(req.body.password,config.passwordPepper);
    await pool.query(`
      UPDATE rewards_users
      SET password_hash=$1,must_change_password=false,updated_at=now()
      WHERE id=$2
    `,[passwordHash,req.user.id]);
    res.status(204).end();
  });

  app.post('/api/auth/logout',authenticate,csrf,async(req,res) => {
    await pool.query('UPDATE rewards_sessions SET revoked_at=now() WHERE id=$1',[req.user.session_id]);
    res.clearCookie(cookieNames.session,sessionCookie)
      .clearCookie(cookieNames.csrf,csrfCookie)
      .status(204)
      .end();
  });

  app.get('/api/summary',authenticate,async(_req,res) => {
    const [programs,visits,deliveries,distribution,games] = await Promise.all([
      pool.query("SELECT count(*)::int total FROM rewards_programs WHERE active AND eligibility_status='eligible'"),
      pool.query(`
        SELECT count(*)::int total
        FROM rewards_attendance a
        JOIN rewards_programs p ON p.id=a.program_id
        WHERE p.active AND p.eligibility_status='eligible'
      `),
      pool.query(`
        SELECT count(*)::int total
        FROM rewards_deliveries d
        JOIN rewards_programs p ON p.id=d.program_id
        WHERE d.status<>'reversed'
          AND p.active
          AND p.eligibility_status='eligible'
      `),
      pool.query(`
        SELECT visits,count(*)::int total
        FROM (
          SELECT p.id,count(DISTINCT a.game_id)::int visits
          FROM rewards_programs p
          LEFT JOIN rewards_attendance a ON a.program_id=p.id
          WHERE p.active AND p.eligibility_status='eligible'
          GROUP BY p.id
        ) distribution
        GROUP BY visits
        ORDER BY visits
      `),
      pool.query(`
        SELECT (count(*) FILTER (WHERE report_status<>'scheduled'))::int processed,
               max(data_cutoff_at) cutoff
        FROM rewards_games
      `)
    ]);
    res.json({
      programs:programs.rows[0].total,
      visits:visits.rows[0].total,
      deliveries:deliveries.rows[0].total,
      distribution:distribution.rows,
      processedGames:games.rows[0].processed,
      cutoff:games.rows[0].cutoff
    });
  });

  app.get('/api/programs',authenticate,async(req,res) => {
    const q = String(req.query.q || '').trim();
    const zone = String(req.query.zone || '').trim();
    const segments = parseSegments(req.query.segments);
    const redeemed = parseMilestones(req.query.redeemed);
    const min = Math.max(0,Math.min(34,Number(req.query.minVisits ?? 0) || 0));
    const maxInput = Number(req.query.maxVisits ?? 34);
    const max = Math.max(min,Math.min(34,Number.isFinite(maxInput) ? maxInput : 34));
    const page = Math.max(1,Math.floor(Number(req.query.page) || 1));
    const pageSize = Math.max(1,Math.min(1000,Math.floor(Number(req.query.pageSize) || 1000)));
    const offset = (page - 1) * pageSize;
    const result = await pool.query(`
      WITH filtered AS (
        SELECT p.id,p.holder_name,p.holder_email,p.holder_phone,p.order_number,
               p.segment,p.zone,p.section,p.seat,
               count(DISTINCT a.game_id)::int visits,
               COALESCE((
                 SELECT array_agg(d.milestone ORDER BY d.milestone)
                 FROM rewards_deliveries d
                 WHERE d.program_id=p.id AND d.status<>'reversed'
               ),ARRAY[]::integer[]) delivered_milestones
        FROM rewards_programs p
        LEFT JOIN rewards_attendance a ON a.program_id=p.id
        WHERE p.active
          AND p.eligibility_status='eligible'
          AND (
            $1=''
            OR p.holder_name ILIKE '%'||$1||'%'
            OR COALESCE(p.holder_email,'') ILIKE '%'||$1||'%'
            OR COALESCE(p.holder_phone,'') ILIKE '%'||$1||'%'
            OR p.order_number ILIKE '%'||$1||'%'
            OR concat_ws(' ',p.zone,p.section,p.seat) ILIKE '%'||$1||'%'
          )
          AND (cardinality($2::text[])=0 OR p.segment=ANY($2::text[]))
          AND ($3='' OR p.zone=$3)
          AND (
            cardinality($4::integer[])=0
            OR EXISTS (
              SELECT 1
              FROM rewards_deliveries delivery_filter
              WHERE delivery_filter.program_id=p.id
                AND delivery_filter.status<>'reversed'
                AND delivery_filter.milestone=ANY($4::integer[])
            )
          )
        GROUP BY p.id
      )
      , eligible AS (
        SELECT *
        FROM filtered
        WHERE visits BETWEEN $5 AND $6
      ), paged AS (
        SELECT *
        FROM eligible
        ORDER BY holder_name,zone,section,seat
        LIMIT $7 OFFSET $8
      )
      SELECT (SELECT count(*)::int FROM eligible) total,
             COALESCE(
               jsonb_agg(to_jsonb(paged) ORDER BY holder_name,zone,section,seat)
                 FILTER (WHERE paged.id IS NOT NULL),
               '[]'::jsonb
             ) items
      FROM paged
    `,[q,segments,zone,redeemed,min,max,pageSize,offset]);
    const total = result.rows[0]?.total || 0;
    const items = result.rows[0]?.items || [];
    res.json({ items,total,page,pageSize });
  });

  app.get('/api/segments',authenticate,(_req,res) => res.json({ items:SEGMENTS }));
  app.get('/api/zones',authenticate,async(_req,res) => {
    const result = await pool.query(`
      SELECT DISTINCT zone
      FROM rewards_programs
      WHERE active AND eligibility_status='eligible'
      ORDER BY zone
    `);
    res.json({ items:result.rows.map((row) => row.zone) });
  });
  app.get('/api/games',authenticate,async(_req,res) => {
    const result = await pool.query(`
      SELECT id,played_on,display_name,sequence_number,report_status,data_cutoff_at
      FROM rewards_games
      ORDER BY sequence_number
    `);
    res.json({ items:result.rows });
  });

  app.get('/api/programs/:id',authenticate,async(req,res) => {
    const detail = await transaction(pool,async(client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const result = await client.query(`
        SELECT p.id,p.season_code,p.holder_name,p.holder_email,p.holder_phone,p.order_number,
               p.purchase_code,p.segment,p.zone,p.section,p.seat,p.source_event,
               count(DISTINCT a.game_id)::int visits
        FROM rewards_programs p
        LEFT JOIN rewards_attendance a ON a.program_id=p.id
        WHERE p.id=$1 AND p.active AND p.eligibility_status='eligible'
        GROUP BY p.id
      `,[req.params.id]);
      if (!result.rowCount) throw httpError(404,'Abono no encontrado');
      const rewards = await client.query(`
        SELECT c.*,d.id delivery_id,d.status,d.delivered_at,d.known_date,
               d.reason,d.recipient_name,d.delivered_by,u.display_name delivered_by_name
        FROM rewards_catalog c
        LEFT JOIN rewards_deliveries d
          ON d.program_id=$1 AND d.milestone=c.milestone AND d.status<>'reversed'
        LEFT JOIN rewards_users u ON u.id=d.delivered_by
        ORDER BY c.milestone
      `,[req.params.id]);
      const seats = await client.query(`
        SELECT p.id,p.segment,p.zone,p.section,p.seat,count(DISTINCT a.game_id)::int visits
        FROM rewards_programs p
        LEFT JOIN rewards_attendance a ON a.program_id=p.id
        WHERE p.active
          AND p.eligibility_status='eligible'
          AND p.order_number=$1
          AND p.season_code=$2
        GROUP BY p.id
        ORDER BY p.zone,p.section,p.seat
      `,[result.rows[0].order_number,result.rows[0].season_code]);
      const attendance = await client.query(`
        SELECT g.sequence_number,g.display_name,g.played_on,a.scanned_at
        FROM rewards_attendance a
        JOIN rewards_games g ON g.id=a.game_id
        WHERE a.program_id=$1
        ORDER BY g.sequence_number
      `,[req.params.id]);
      const deliveryHistory = await client.query(`
        SELECT d.id,d.milestone,c.benefit,c.benefit_type,d.status,d.recipient_name,
               d.delivered_at,d.known_date,d.reason,d.delivered_by,
               delivered_user.display_name delivered_by_name,
               d.reversed_at,d.reversed_by,reversed_user.display_name reversed_by_name,
               d.reversal_reason,d.created_at
        FROM rewards_deliveries d
        JOIN rewards_catalog c ON c.milestone=d.milestone
        LEFT JOIN rewards_users delivered_user ON delivered_user.id=d.delivered_by
        LEFT JOIN rewards_users reversed_user ON reversed_user.id=d.reversed_by
        WHERE d.program_id=$1
        ORDER BY d.milestone,
                 (d.status<>'reversed') DESC,
                 CASE WHEN d.status='reversed' THEN d.reversed_at ELSE d.created_at END DESC NULLS LAST,
                 d.created_at DESC,d.id DESC
      `,[req.params.id]);
      return { result,rewards,seats,attendance,deliveryHistory };
    });
    const deliveries = detail.rewards.rows
      .filter((reward) => reward.delivery_id)
      .map((reward) => ({
        id:reward.delivery_id,
        milestone:reward.milestone,
        status:reward.status,
        deliveredAt:reward.delivered_at,
        knownDate:reward.known_date,
        reason:reward.reason,
        deliveredBy:reward.delivered_by,
        deliveredByName:reward.delivered_by_name,
        recipientName:reward.recipient_name ?? null
      }));
    const deliveryHistoryItems = projectCurrentDeliveryHistory(detail.deliveryHistory.rows);
    res.json({
      program:detail.result.rows[0],
      rewards:detail.rewards.rows,
      deliveries,
      deliveryHistory:deliveryHistoryItems,
      seats:detail.seats.rows,
      attendance:detail.attendance.rows
    });
  });

  app.post('/api/programs/:id/deliveries',authenticate,csrf,async(req,res) => {
    const milestone = Number(req.body?.milestone);
    if (!Number.isInteger(milestone) || milestone < 2 || milestone > 30 || milestone % 2 !== 0) {
      return res.status(400).json({ error:'Hito de recompensa inválido' });
    }
    const historical = Boolean(req.body?.historical);
    if (historical && req.user.role !== 'administrator') {
      return res.status(403).json({ error:'Sólo un administrador puede registrar entregas históricas' });
    }
    const recipientName = normalizeRecipientName(req.body?.recipientName);
    const status = historical ? 'historical_unreviewed' : 'delivered';
    const knownDate = historical ? !Boolean(req.body?.unknownDate) : true;
    let deliveredAt = new Date();
    if (historical && !knownDate) deliveredAt = null;
    if (historical && knownDate) {
      deliveredAt = new Date(req.body?.deliveredAt);
      if (Number.isNaN(deliveredAt.getTime())) {
        return res.status(400).json({ error:'Indica la fecha conocida de la entrega histórica' });
      }
    }
    const deliveryReason = String(req.body?.reason || '').trim() || null;
    const requestedIdempotency = req.get('idempotency-key');
    if (requestedIdempotency && !isUuid(requestedIdempotency)) {
      return res.status(400).json({ error:'La llave de confirmación no es válida' });
    }
    const idempotency = isUuid(requestedIdempotency) ? requestedIdempotency : crypto.randomUUID();
    const hasExpectedLatestDeliveryId = Object.prototype.hasOwnProperty.call(
      req.body || {},
      'expectedLatestDeliveryId'
    );
    const expectedLatestDeliveryId = req.body?.expectedLatestDeliveryId === null
      ? null
      : String(req.body?.expectedLatestDeliveryId || '').trim();
    const validExpectedLatestDeliveryId = hasExpectedLatestDeliveryId
      && (expectedLatestDeliveryId === null || isUuid(expectedLatestDeliveryId));
    const matchesIdempotentRequest = (existing) => {
      if (existing.program_id !== req.params.id
          || existing.milestone !== milestone
          || existing.status !== status
          || existing.known_date !== knownDate
          || existing.recipient_name !== recipientName
          || (existing.reason ?? null) !== deliveryReason) {
        return false;
      }
      if (!historical) return true;
      const existingTimestamp = existing.delivered_at
        ? new Date(existing.delivered_at).getTime()
        : null;
      const requestedTimestamp = deliveredAt ? deliveredAt.getTime() : null;
      return existingTimestamp === requestedTimestamp;
    };
    const delivery = await transaction(pool,async(client) => {
      const program = await client.query(`
        SELECT id
        FROM rewards_programs
        WHERE id=$1 AND active AND eligibility_status='eligible'
        FOR UPDATE
      `,[req.params.id]);
      if (!program.rowCount) throw httpError(404,'Abono no encontrado');
      const existingIdempotent = await client.query(`
        SELECT *
        FROM rewards_deliveries
        WHERE delivered_by=$1 AND idempotency_key=$2
      `,[req.user.id,idempotency]);
      if (existingIdempotent.rowCount) {
        if (matchesIdempotentRequest(existingIdempotent.rows[0])) {
          return { ...existingIdempotent.rows[0],idempotentReplay:true };
        }
        throw httpError(409,'La llave de confirmación ya fue utilizada con datos diferentes');
      }
      if (!validExpectedLatestDeliveryId) {
        throw httpError(409,'Actualiza el perfil antes de entregar: falta identificar la versión vigente del hito');
      }
      const latestVersion = await client.query(`
        SELECT id
        FROM rewards_deliveries
        WHERE program_id=$1 AND milestone=$2
        ORDER BY COALESCE(reversed_at,created_at) DESC,created_at DESC,id DESC
        LIMIT 1
      `,[req.params.id,milestone]);
      const latestDeliveryId = latestVersion.rows[0]?.id ?? null;
      if (latestDeliveryId !== expectedLatestDeliveryId) {
        throw httpError(409,'La entrega cambió desde otra sesión; actualiza el perfil antes de continuar');
      }
      const catalog = await client.query('SELECT milestone FROM rewards_catalog WHERE milestone=$1',[milestone]);
      if (!catalog.rowCount) throw httpError(400,'Hito de recompensa inválido');
      const eligibility = await client.query(`
        SELECT count(DISTINCT game_id)::int visits
        FROM rewards_attendance
        WHERE program_id=$1
      `,[req.params.id]);
      if (eligibility.rows[0].visits < milestone + 1) {
        throw httpError(409,'El canje se habilita desde la siguiente asistencia al hito');
      }
      const inserted = await client.query(`
        INSERT INTO rewards_deliveries(
          program_id,milestone,status,delivered_at,delivered_by,known_date,reason,idempotency_key,
          recipient_name,created_at
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp())
        ON CONFLICT DO NOTHING
        RETURNING *
      `,[
        req.params.id,milestone,status,deliveredAt,req.user.id,knownDate,
        deliveryReason,idempotency,recipientName
      ]);
      if (!inserted.rowCount) {
        const replay = await client.query(`
          SELECT *
          FROM rewards_deliveries
          WHERE delivered_by=$1 AND idempotency_key=$2
        `,[req.user.id,idempotency]);
        if (replay.rowCount && matchesIdempotentRequest(replay.rows[0])) {
          return { ...replay.rows[0],idempotentReplay:true };
        }
        throw httpError(409,'Esta entrega ya estaba registrada');
      }
      await client.query(`
        INSERT INTO rewards_audit(actor_id,action,entity_type,entity_id,metadata)
        VALUES($1,'delivery.recorded','program',$2,$3)
      `,[req.user.id,req.params.id,JSON.stringify({ milestone,status })]);
      return inserted.rows[0];
    });
    res.status(delivery.idempotentReplay ? 200 : 201).json({
      ...delivery,
      recipientName:delivery.recipient_name
    });
  });

  app.delete('/api/programs/:id/deliveries/:milestone',authenticate,csrf,async(req,res) => {
    const deliveryId = String(req.body?.deliveryId || '').trim();
    if (!isUuid(deliveryId)) {
      return res.status(409).json({
        error:'Actualiza el perfil antes de corregir: falta identificar la versión vigente de la entrega'
      });
    }
    const milestone = Number(req.params.milestone);
    if (!Number.isInteger(milestone)) return res.status(400).json({ error:'Hito de recompensa inválido' });
    const reason = String(req.body?.reason || 'Corrección manual desde el perfil').trim();
    await transaction(pool,async(client) => {
      const program = await client.query(`
        SELECT id
        FROM rewards_programs
        WHERE id=$1
        FOR UPDATE
      `,[req.params.id]);
      if (!program.rowCount) throw httpError(404,'Abono no encontrado');
      const current = await client.query(`
        SELECT id,program_id,milestone
        FROM rewards_deliveries
        WHERE program_id=$1 AND milestone=$2 AND id=$3 AND status<>'reversed'
        FOR UPDATE
      `,[req.params.id,milestone,deliveryId]);
      if (!current.rowCount) {
        throw httpError(409,'La entrega cambió desde otra sesión; actualiza el perfil antes de corregir');
      }
      await client.query(`
        UPDATE rewards_deliveries
        SET status='reversed',reversed_at=clock_timestamp(),reversed_by=$1,reversal_reason=$2
        WHERE id=$3 AND status<>'reversed'
      `,[req.user.id,reason,current.rows[0].id]);
      await client.query(`
        INSERT INTO rewards_audit(actor_id,action,entity_type,entity_id,reason,metadata)
        VALUES($1,'delivery.reversed','delivery',$2,$3,$4)
      `,[req.user.id,current.rows[0].id,reason,JSON.stringify({ program_id:req.params.id,milestone })]);
    });
    res.status(204).end();
  });

  app.get('/api/admin/users',authenticate,admin,async(_req,res) => {
    const result = await pool.query(`
      SELECT id,email,display_name,role,active,must_change_password
      FROM rewards_users
      ORDER BY role,display_name
    `);
    res.json({ items:result.rows });
  });
  app.get('/api/admin/audit',authenticate,admin,async(_req,res) => {
    const result = await pool.query(`
      SELECT a.id,a.action,a.entity_type,a.entity_id,a.reason,a.metadata,a.created_at,
             u.display_name actor
      FROM rewards_audit a
      LEFT JOIN rewards_users u ON u.id=a.actor_id
      ORDER BY a.created_at DESC
      LIMIT 300
    `);
    res.json({ items:result.rows });
  });

  // Alias de compatibilidad: ambos roles pueden corregir una entrega y toda
  // corrección queda registrada en la bitácora interna.
  app.post('/api/admin/deliveries/:id/reverse',authenticate,csrf,async(req,res) => {
    const reason = String(req.body?.reason || 'Corrección manual desde el perfil').trim();
    await transaction(pool,async(client) => {
      const target = await client.query(`
        SELECT program_id
        FROM rewards_deliveries
        WHERE id=$1
      `,[req.params.id]);
      if (!target.rowCount) throw httpError(404,'Entrega no localizada');
      await client.query(`
        SELECT id
        FROM rewards_programs
        WHERE id=$1
        FOR UPDATE
      `,[target.rows[0].program_id]);
      const current = await client.query(`
        SELECT id,program_id,milestone
        FROM rewards_deliveries
        WHERE id=$1 AND status<>'reversed'
        FOR UPDATE
      `,[req.params.id]);
      if (!current.rowCount) throw httpError(404,'Entrega no localizada o ya revertida');
      await client.query(`
        UPDATE rewards_deliveries
        SET status='reversed',reversed_at=clock_timestamp(),reversed_by=$1,reversal_reason=$2
        WHERE id=$3 AND status<>'reversed'
      `,[req.user.id,reason,req.params.id]);
      await client.query(`
        INSERT INTO rewards_audit(actor_id,action,entity_type,entity_id,reason,metadata)
        VALUES($1,'delivery.reversed','delivery',$2,$3,$4)
      `,[req.user.id,req.params.id,reason,JSON.stringify(current.rows[0])]);
    });
    res.status(204).end();
  });

  app.post('/api/admin/programs/:id/transfer',authenticate,csrf,admin,async(req,res) => {
    const { zone,section,seat,reason } = req.body || {};
    if (!zone || !section || !seat || String(reason || '').trim().length < 5) {
      return res.status(400).json({ error:'Ubicación completa y motivo son obligatorios' });
    }
    await transaction(pool,async(client) => {
      const current = await client.query('SELECT zone,section,seat,segment,source_event FROM rewards_programs WHERE id=$1 FOR UPDATE',[req.params.id]);
      if (!current.rowCount) throw httpError(404,'Programa no localizado');
      const segment = classifySegment(zone,current.rows[0].source_event) || current.rows[0].segment;
      await client.query(`
        INSERT INTO rewards_transfers(program_id,from_location,to_location,reason,actor_id)
        VALUES($1,$2,$3,$4,$5)
      `,[req.params.id,JSON.stringify(current.rows[0]),JSON.stringify({ zone,section,seat }),reason.trim(),req.user.id]);
      await client.query(`
        UPDATE rewards_programs
        SET zone=$1,section=$2,seat=$3,segment=$4,manual_lock=true,updated_at=now()
        WHERE id=$5
      `,[zone,section,seat,segment,req.params.id]);
      await client.query(`
        INSERT INTO rewards_audit(actor_id,action,entity_type,entity_id,reason,metadata)
        VALUES($1,'program.transferred','program',$2,$3,$4)
      `,[req.user.id,req.params.id,reason.trim(),JSON.stringify({ from:current.rows[0],to:{ zone,section,seat } })]);
    });
    res.status(204).end();
  });

  const workbookBody = express.raw({
    type:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream'],
    limit:'20mb'
  });
  const inspectAccess = async(buffer) => {
    const [programs,aliases] = await Promise.all([
      pool.query(`
        SELECT id,order_number,zone,section,seat,segment,eligibility_exception
        FROM rewards_programs
        WHERE active AND eligibility_status='eligible'
      `),
      pool.query(`
        SELECT p.id,p.segment,
               a.historical_order_number,a.historical_zone,
               a.historical_section,a.historical_seat
        FROM rewards_program_aliases a
        JOIN rewards_programs p ON p.id=a.program_id
        WHERE a.active AND p.active AND p.eligibility_status='eligible'
      `)
    ]);
    return inspectWorkbook(buffer,{
      kind:'access',
      knownPrograms:programs.rows,
      knownAliases:aliases.rows
    });
  };
  const validateAccessDate = async(result,gameId,client=pool) => {
    const game = await client.query('SELECT played_on::text played_on FROM rewards_games WHERE id=$1',[gameId]);
    if (!game.rowCount) throw httpError(400,'Partido no localizado');
    const mismatched = result.observedDates.filter((date) => date !== game.rows[0].played_on);
    if (mismatched.length) {
      throw httpError(400,`La fecha del reporte (${mismatched.join(', ')}) no corresponde al partido seleccionado (${game.rows[0].played_on})`);
    }
    return game.rows[0];
  };

  app.post('/api/admin/imports/preview',authenticate,csrf,admin,workbookBody,async(req,res) => {
    const kind = String(req.query.kind || '');
    if (kind !== 'access') return res.status(400).json({ error:'Solo se admiten reportes de asistencias' });
    const gameId = String(req.query.gameId || '');
    if (!gameId) return res.status(400).json({ error:'Selecciona el partido antes de previsualizar' });
    const result = await inspectAccess(req.body);
    await validateAccessDate(result,gameId);
    res.json({
      ...result,
      counts:{
        included:result.included.length,
        excluded:result.excluded.length,
        review:result.review.length,
        duplicates:result.duplicates.length
      },
      included:result.included.slice(0,100),
      excluded:result.excluded.slice(0,100),
      review:result.review.slice(0,100),
      duplicates:result.duplicates.slice(0,100)
    });
  });

  app.post('/api/admin/imports/confirm',authenticate,csrf,admin,workbookBody,async(req,res) => {
    const kind = String(req.query.kind || '');
    if (kind !== 'access') return res.status(400).json({ error:'Solo se admiten reportes de asistencias' });
    const filename = String(req.get('x-original-filename') || 'reporte.xlsx').slice(0,200);
    const gameId = req.query.gameId || null;
    const reportStatus = req.query.reportStatus || null;
    if (!gameId || !['partial','closed'].includes(reportStatus)) {
      return res.status(400).json({ error:'Confirma partido y tipo de corte' });
    }
    const result = await inspectAccess(req.body);
    await validateAccessDate(result,gameId);
    if (result.review.length) {
      throw httpError(409,`No se puede confirmar: ${result.review.length} fila(s) requieren revisión`);
    }

    const persisted = await transaction(pool,async(client) => {
      const baseSummary = {
        sourceRows:result.sourceRows,
        totalRows:result.totalRows,
        ignoredRows:result.ignoredRows,
        included:result.included.length,
        excluded:result.excluded.length,
        review:result.review.length,
        duplicates:result.duplicates.length,
        matchStrategies:result.matchStrategies
      };
      const imported = await client.query(`
        INSERT INTO rewards_imports(kind,sha256,original_filename,game_id,report_status,summary,imported_by)
        VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(sha256) DO NOTHING
        RETURNING id
      `,['access',result.sha256,filename,gameId,reportStatus,JSON.stringify(baseSummary),req.user.id]);
      if (!imported.rowCount) throw httpError(409,'Este archivo ya fue importado');

      let insertedCount = 0;
      let earlierScanUpdatedCount = 0;
      await validateAccessDate(result,gameId,client);
      for (const row of result.included) {
        const attendance = await client.query(`
          INSERT INTO rewards_attendance(program_id,game_id,first_import_id,scanned_at,barcode)
          VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(program_id,game_id) DO NOTHING
          RETURNING id
        `,[row.programId,gameId,imported.rows[0].id,row.scannedAt,row.barcode]);
        insertedCount += attendance.rowCount;
        if (!attendance.rowCount) {
          const earlierScan = await client.query(`
            UPDATE rewards_attendance
            SET scanned_at=$3,
                barcode=COALESCE(NULLIF($4,''),barcode)
            WHERE program_id=$1 AND game_id=$2 AND scanned_at>$3
            RETURNING id
          `,[row.programId,gameId,row.scannedAt,row.barcode]);
          earlierScanUpdatedCount += earlierScan.rowCount;
        }
      }
      await client.query(`
        UPDATE rewards_games
        SET report_status=CASE
              WHEN report_status='closed' OR $2='closed' THEN 'closed'
              ELSE 'partial'
            END,
            data_cutoff_at=COALESCE((
              SELECT max(scanned_at)
              FROM rewards_attendance
              WHERE game_id=$1
            ),data_cutoff_at)
        WHERE id=$1
      `,[gameId,reportStatus]);

      const persistedSummary = {
        ...baseSummary,
        inserted:insertedCount,
        alreadyCounted:result.included.length - insertedCount,
        earlierScanUpdated:earlierScanUpdatedCount
      };
      await client.query('UPDATE rewards_imports SET summary=$1 WHERE id=$2',[JSON.stringify(persistedSummary),imported.rows[0].id]);
      await client.query(`
        INSERT INTO rewards_audit(actor_id,action,entity_type,entity_id,metadata)
        VALUES($1,'import.confirmed','import',$2,$3)
      `,[req.user.id,imported.rows[0].id,JSON.stringify({ kind:'access',sha256:result.sha256,...persistedSummary })]);
      return persistedSummary;
    });
    res.status(201).json({ ok:true,sha256:result.sha256,summary:persisted });
  });

  app.use((error,_req,res,_next) => {
    if (!error.status || error.status >= 500) console.error(error);
    res.status(error.status || 500).json({ error:error.status ? error.message : 'No se pudo completar la operación' });
  });
  return app;
}
