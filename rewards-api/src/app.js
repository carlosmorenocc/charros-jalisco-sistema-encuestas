import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { digest, normalizeEmail, randomToken, verifyPassword, hashPassword } from './security.js';
import { inspectWorkbook, seatKey } from './workbook.js';
import { transaction } from './db.js';

const COOKIE = '__Host-charros_rewards_session';
const CSRF = '__Host-charros_rewards_csrf';
const safeUser = (row) => ({ id: row.id, email: row.email, displayName: row.display_name, role: row.role, mustChangePassword: row.must_change_password });

export function createApp({ pool, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  const cookie = { httpOnly: true, secure: config.cookieSecure, sameSite: 'strict', path: '/' };
  const authenticate = async (req,res,next) => {
    const token = req.cookies[COOKIE];
    if (!token) return res.status(401).json({ error: 'Sesión requerida' });
    const result = await pool.query(`SELECT u.*,s.id session_id,s.csrf_digest FROM rewards_sessions s JOIN rewards_users u ON u.id=s.user_id WHERE s.token_digest=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND s.idle_expires_at>now() AND u.active`, [digest(token,config.sessionKey)]);
    if (!result.rowCount) return res.status(401).json({ error: 'Sesión inválida' });
    req.user = result.rows[0];
    await pool.query('UPDATE rewards_sessions SET last_seen_at=now(),idle_expires_at=LEAST(expires_at,now()+interval \'45 minutes\') WHERE id=$1',[req.user.session_id]);
    next();
  };
  const csrf = (req,res,next) => {
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    const raw = req.get('x-csrf-token');
    if (!raw || raw !== req.cookies[CSRF] || digest(raw,config.sessionKey) !== req.user.csrf_digest) return res.status(403).json({ error:'Solicitud insegura rechazada' });
    next();
  };
  const admin = (req,res,next) => req.user.role === 'administrator' ? next() : res.status(403).json({ error:'Permiso de administrador requerido' });

  app.get('/ready', (_req,res) => res.json({ ok:true, service:'charros-rewards-api' }));
  app.post('/api/auth/login', rateLimit({ windowMs:15*60*1000, limit:5 }), async (req,res) => {
    const result = await pool.query('SELECT * FROM rewards_users WHERE email=$1 AND active',[normalizeEmail(req.body.email)]);
    const user = result.rows[0];
    if (!user || !user.password_hash || !(await verifyPassword(req.body.password,user.password_hash,config.passwordPepper))) return res.status(401).json({ error:'Credenciales incorrectas' });
    const token=randomToken(), csrfToken=randomToken();
    await pool.query(`INSERT INTO rewards_sessions(user_id,token_digest,csrf_digest,expires_at,idle_expires_at) VALUES($1,$2,$3,now()+interval '8 hours',now()+interval '45 minutes')`,[user.id,digest(token,config.sessionKey),digest(csrfToken,config.sessionKey)]);
    res.cookie(COOKIE,token,cookie).cookie(CSRF,csrfToken,{...cookie,httpOnly:false}).json({ user:safeUser(user), csrfToken });
  });
  app.get('/api/auth/session', authenticate, (req,res) => res.json({ user:safeUser(req.user), csrfToken:req.cookies[CSRF] }));
  app.post('/api/auth/change-password', authenticate, csrf, async (req,res) => {
    const passwordHash=await hashPassword(req.body.password,config.passwordPepper);
    await pool.query('UPDATE rewards_users SET password_hash=$1,must_change_password=false,updated_at=now() WHERE id=$2',[passwordHash,req.user.id]);
    res.status(204).end();
  });
  app.post('/api/auth/logout', authenticate, csrf, async (req,res) => { await pool.query('UPDATE rewards_sessions SET revoked_at=now() WHERE id=$1',[req.user.session_id]); res.clearCookie(COOKIE,{path:'/'}).clearCookie(CSRF,{path:'/'}).status(204).end(); });

  app.get('/api/summary', authenticate, async (_req,res) => {
    const [programs,visits,pending] = await Promise.all([pool.query('SELECT count(*)::int total FROM rewards_programs WHERE active'),pool.query('SELECT count(*)::int total FROM rewards_attendance'),pool.query(`SELECT count(*)::int total FROM rewards_deliveries WHERE status='historical_unreviewed'`)]);
    res.json({ programs:programs.rows[0].total, visits:visits.rows[0].total, historicalPending:pending.rows[0].total });
  });
  app.get('/api/programs', authenticate, async (req,res) => {
    const q=String(req.query.q||'').trim();
    const result=await pool.query(`SELECT p.id,p.holder_name,p.order_number,p.zone,p.section,p.seat,count(DISTINCT a.game_id)::int visits FROM rewards_programs p LEFT JOIN rewards_attendance a ON a.program_id=p.id WHERE p.active AND ($1='' OR p.holder_name ILIKE '%'||$1||'%' OR p.order_number ILIKE '%'||$1||'%' OR concat_ws(' ',p.zone,p.section,p.seat) ILIKE '%'||$1||'%') GROUP BY p.id ORDER BY p.holder_name,p.zone,p.section,p.seat LIMIT 200`,[q]);
    res.json({ items:result.rows });
  });
  app.get('/api/programs/:id', authenticate, async (req,res) => {
    const result=await pool.query(`SELECT p.id,p.holder_name,p.order_number,p.purchase_code,p.zone,p.section,p.seat,p.source_event,count(DISTINCT a.game_id)::int visits FROM rewards_programs p LEFT JOIN rewards_attendance a ON a.program_id=p.id WHERE p.id=$1 GROUP BY p.id`,[req.params.id]);
    if (!result.rowCount) return res.status(404).json({error:'Butaca no encontrada'});
    const rewards=await pool.query(`SELECT c.*,d.status,d.delivered_at FROM rewards_catalog c LEFT JOIN rewards_deliveries d ON d.program_id=$1 AND d.milestone=c.milestone AND d.status<>'reversed' ORDER BY c.milestone`,[req.params.id]);
    res.json({ program:result.rows[0], rewards:rewards.rows });
  });
  app.post('/api/programs/:id/deliveries', authenticate, csrf, async (req,res) => {
    const idempotency=req.get('idempotency-key') || crypto.randomUUID();
    const status=req.body.historical ? 'historical_unreviewed' : 'delivered';
    const result=await pool.query(`INSERT INTO rewards_deliveries(program_id,milestone,status,delivered_at,delivered_by,known_date,reason,idempotency_key) VALUES($1,$2,$3,CASE WHEN $4 THEN NULL ELSE now() END,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING *`,[req.params.id,req.body.milestone,status,Boolean(req.body.unknownDate),req.user.id,!req.body.unknownDate,req.body.reason||null,idempotency]);
    if (!result.rowCount) return res.status(409).json({error:'Esta entrega ya estaba registrada'});
    await pool.query(`INSERT INTO rewards_audit(actor_id,action,entity_type,entity_id,metadata) VALUES($1,'delivery.recorded','program',$2,$3)`,[req.user.id,req.params.id,JSON.stringify({milestone:req.body.milestone,status})]);
    res.status(201).json(result.rows[0]);
  });
  app.get('/api/admin/users', authenticate, admin, async (_req,res) => res.json({items:(await pool.query('SELECT id,email,display_name,role,active,must_change_password FROM rewards_users ORDER BY role,display_name')).rows}));
  const workbookBody=express.raw({type:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream'],limit:'20mb'});
  const inspect=async(buffer,kind)=>{
    let knownPrograms=new Map();
    if(kind==='access'){
      const rows=(await pool.query('SELECT id,order_number,zone,section,seat FROM rewards_programs WHERE active')).rows;
      knownPrograms=new Map(rows.map(row=>[seatKey(row.order_number,row.zone,row.section,row.seat),row]));
    }
    return inspectWorkbook(buffer,{kind,knownPrograms});
  };
  app.post('/api/admin/imports/preview',authenticate,csrf,admin,workbookBody,async(req,res)=>{
    const result=await inspect(req.body,String(req.query.kind||''));
    res.json({...result,included:result.included.slice(0,100),excluded:result.excluded.slice(0,100),review:result.review.slice(0,100),duplicates:result.duplicates.slice(0,100)});
  });
  app.post('/api/admin/imports/confirm',authenticate,csrf,admin,workbookBody,async(req,res)=>{
    const kind=String(req.query.kind||''), filename=String(req.get('x-original-filename')||'reporte.xlsx').slice(0,200);
    const result=await inspect(req.body,kind);
    const gameId=req.query.gameId||null, reportStatus=req.query.reportStatus||null;
    if(kind==='access'&&(!gameId||!['partial','closed'].includes(reportStatus))) return res.status(400).json({error:'Confirma partido y tipo de corte'});
    await transaction(pool,async client=>{
      const imported=await client.query(`INSERT INTO rewards_imports(kind,sha256,original_filename,game_id,report_status,summary,imported_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(sha256) DO NOTHING RETURNING id`,[kind,result.sha256,filename,gameId,reportStatus,JSON.stringify({totalRows:result.totalRows,included:result.included.length,excluded:result.excluded.length,review:result.review.length,duplicates:result.duplicates.length}),req.user.id]);
      if(!imported.rowCount){const error=new Error('Este archivo ya fue importado');error.status=409;throw error}
      if(kind==='sales') for(const row of [...result.included,...result.review]) await client.query(`INSERT INTO rewards_programs(order_number,purchase_code,holder_name,holder_email,holder_phone,zone,section,seat,barcode,source_event,eligibility_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(season_code,order_number,zone,section,seat) DO UPDATE SET purchase_code=CASE WHEN rewards_programs.manual_lock THEN rewards_programs.purchase_code ELSE EXCLUDED.purchase_code END,holder_name=CASE WHEN rewards_programs.manual_lock THEN rewards_programs.holder_name ELSE EXCLUDED.holder_name END,holder_email=CASE WHEN rewards_programs.manual_lock THEN rewards_programs.holder_email ELSE EXCLUDED.holder_email END,holder_phone=CASE WHEN rewards_programs.manual_lock THEN rewards_programs.holder_phone ELSE EXCLUDED.holder_phone END,barcode=CASE WHEN rewards_programs.manual_lock THEN rewards_programs.barcode ELSE EXCLUDED.barcode END,updated_at=now()`,[row.orderNumber,row.purchaseCode,row.holderName,row.holderEmail,row.holderPhone,row.zone,row.section,row.seat,row.barcode,row.sourceEvent,row.specialReview?'review':'eligible']);
      if(kind==='access') for(const row of result.included){const [date,time]=row.scannedAt.split(' '),[day,month,year]=date.split('/');const scannedAt=`20${year}-${month}-${day}T${time}:00-06:00`;await client.query(`INSERT INTO rewards_attendance(program_id,game_id,first_import_id,scanned_at,barcode) VALUES($1,$2,$3,$4,$5) ON CONFLICT(program_id,game_id) DO NOTHING`,[row.programId,gameId,imported.rows[0].id,scannedAt,row.barcode])}
      await client.query(`INSERT INTO rewards_audit(actor_id,action,entity_type,entity_id,metadata) VALUES($1,'import.confirmed','import',$2,$3)`,[req.user.id,imported.rows[0].id,JSON.stringify({kind,sha256:result.sha256})]);
    });
    res.status(201).json({ok:true,sha256:result.sha256,summary:{included:result.included.length,excluded:result.excluded.length,review:result.review.length,duplicates:result.duplicates.length}});
  });
  app.use((error,_req,res,_next) => { console.error(error); res.status(error.status||500).json({error:error.status?error.message:'No se pudo completar la operación'}); });
  return app;
}
