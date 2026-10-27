import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { digest, normalizeEmail, randomToken, verifyPassword, hashPassword } from './security.js';
import { inspectWorkbook, seatKey } from './workbook.js';
import { SEGMENTS, classifySegment, parseSegments } from './segments.js';
import { transaction } from './db.js';

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
  app.use(express.json({ limit: '256kb' }));
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

  app.get('/ready',async(_req,res) => {
    await pool.query('SELECT 1');
    res.json({ ok:true,service:'charros-rewards-api' });
  });

  app.post('/api/auth/login',rateLimit({ windowMs:15*60*1000,limit:5,standardHeaders:'draft-8',legacyHeaders:false }),async(req,res) => {
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
    const result = await pool.query(`
      SELECT p.id,p.season_code,p.holder_name,p.holder_email,p.holder_phone,p.order_number,
             p.purchase_code,p.segment,p.zone,p.section,p.seat,p.source_event,
             count(DISTINCT a.game_id)::int visits
      FROM rewards_programs p
      LEFT JOIN rewards_attendance a ON a.program_id=p.id
      WHERE p.id=$1 AND p.active AND p.eligibility_status='eligible'
      GROUP BY p.id
    `,[req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error:'Abono no encontrado' });
    const [rewards,seats,attendance] = await Promise.all([
      pool.query(`
        SELECT c.*,d.id delivery_id,d.status,d.delivered_at,d.known_date,
               d.reason,d.delivered_by,u.display_name delivered_by_name
        FROM rewards_catalog c
        LEFT JOIN rewards_deliveries d
          ON d.program_id=$1 AND d.milestone=c.milestone AND d.status<>'reversed'
        LEFT JOIN rewards_users u ON u.id=d.delivered_by
        ORDER BY c.milestone
      `,[req.params.id]),
      pool.query(`
        SELECT p.id,p.segment,p.zone,p.section,p.seat,count(DISTINCT a.game_id)::int visits
        FROM rewards_programs p
        LEFT JOIN rewards_attendance a ON a.program_id=p.id
        WHERE p.active
          AND p.eligibility_status='eligible'
          AND p.order_number=$1
          AND p.season_code=$2
        GROUP BY p.id
        ORDER BY p.zone,p.section,p.seat
      `,[result.rows[0].order_number,result.rows[0].season_code]),
      pool.query(`
        SELECT g.sequence_number,g.display_name,g.played_on,a.scanned_at
        FROM rewards_attendance a
        JOIN rewards_games g ON g.id=a.game_id
        WHERE a.program_id=$1
        ORDER BY g.sequence_number
      `,[req.params.id])
    ]);
    const deliveries = rewards.rows
      .filter((reward) => reward.delivery_id)
      .map((reward) => ({
        id:reward.delivery_id,
        milestone:reward.milestone,
        status:reward.status,
        deliveredAt:reward.delivered_at,
        knownDate:reward.known_date,
        reason:reward.reason,
        deliveredBy:reward.delivered_by,
        deliveredByName:reward.delivered_by_name
      }));
    res.json({ program:result.rows[0],rewards:rewards.rows,deliveries,seats:seats.rows,attendance:attendance.rows });
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
    const status = historical ? 'historical_unreviewed' : 'delivered';
    let deliveredAt = new Date();
    if (historical && req.body?.unknownDate) deliveredAt = null;
    if (historical && !req.body?.unknownDate) {
      deliveredAt = new Date(req.body?.deliveredAt);
      if (Number.isNaN(deliveredAt.getTime())) {
        return res.status(400).json({ error:'Indica la fecha conocida de la entrega histórica' });
      }
    }
    const requestedIdempotency = req.get('idempotency-key');
    const idempotency = isUuid(requestedIdempotency) ? requestedIdempotency : crypto.randomUUID();
    const delivery = await transaction(pool,async(client) => {
      const program = await client.query(`
        SELECT id
        FROM rewards_programs
        WHERE id=$1 AND active AND eligibility_status='eligible'
        FOR UPDATE
      `,[req.params.id]);
      if (!program.rowCount) throw httpError(404,'Abono no encontrado');
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
          program_id,milestone,status,delivered_at,delivered_by,known_date,reason,idempotency_key
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT DO NOTHING
        RETURNING *
      `,[req.params.id,milestone,status,deliveredAt,req.user.id,!req.body?.unknownDate,req.body?.reason || null,idempotency]);
      if (!inserted.rowCount) throw httpError(409,'Esta entrega ya estaba registrada');
      await client.query(`
        INSERT INTO rewards_audit(actor_id,action,entity_type,entity_id,metadata)
        VALUES($1,'delivery.recorded','program',$2,$3)
      `,[req.user.id,req.params.id,JSON.stringify({ milestone,status })]);
      return inserted.rows[0];
    });
    res.status(201).json(delivery);
  });

  app.delete('/api/programs/:id/deliveries/:milestone',authenticate,csrf,async(req,res) => {
    const milestone = Number(req.params.milestone);
    if (!Number.isInteger(milestone)) return res.status(400).json({ error:'Hito de recompensa inválido' });
    const reason = String(req.body?.reason || 'Corrección manual desde el perfil').trim();
    await transaction(pool,async(client) => {
      const current = await client.query(`
        SELECT id,program_id,milestone
        FROM rewards_deliveries
        WHERE program_id=$1 AND milestone=$2 AND status<>'reversed'
        FOR UPDATE
      `,[req.params.id,milestone]);
      if (!current.rowCount) throw httpError(404,'Entrega activa no localizada');
      await client.query(`
        UPDATE rewards_deliveries
        SET status='reversed',reversed_at=now(),reversed_by=$1,reversal_reason=$2
        WHERE id=$3
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
      const current = await client.query(`
        SELECT id,program_id,milestone
        FROM rewards_deliveries
        WHERE id=$1 AND status<>'reversed'
        FOR UPDATE
      `,[req.params.id]);
      if (!current.rowCount) throw httpError(404,'Entrega no localizada o ya revertida');
      await client.query(`
        UPDATE rewards_deliveries
        SET status='reversed',reversed_at=now(),reversed_by=$1,reversal_reason=$2
        WHERE id=$3
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
    const rows = (await pool.query(`
      SELECT id,order_number,zone,section,seat
      FROM rewards_programs
      WHERE active AND eligibility_status='eligible'
    `)).rows;
    const knownPrograms = new Map(rows.map((row) => [seatKey(row.order_number,row.zone,row.section,row.seat),row]));
    return inspectWorkbook(buffer,{ kind:'access',knownPrograms });
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

    const persisted = await transaction(pool,async(client) => {
      const baseSummary = {
        totalRows:result.totalRows,
        included:result.included.length,
        excluded:result.excluded.length,
        review:result.review.length,
        duplicates:result.duplicates.length
      };
      const imported = await client.query(`
        INSERT INTO rewards_imports(kind,sha256,original_filename,game_id,report_status,summary,imported_by)
        VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(sha256) DO NOTHING
        RETURNING id
      `,['access',result.sha256,filename,gameId,reportStatus,JSON.stringify(baseSummary),req.user.id]);
      if (!imported.rowCount) throw httpError(409,'Este archivo ya fue importado');

      let insertedCount = 0;
      await validateAccessDate(result,gameId,client);
      for (const row of result.included) {
        const attendance = await client.query(`
          INSERT INTO rewards_attendance(program_id,game_id,first_import_id,scanned_at,barcode)
          VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(program_id,game_id) DO NOTHING
          RETURNING id
        `,[row.programId,gameId,imported.rows[0].id,row.scannedAt,row.barcode]);
        insertedCount += attendance.rowCount;
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
        alreadyCounted:result.included.length - insertedCount
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
