import crypto from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestContext(auditHashKey) {
  return function requestContextMiddleware(req, res, next) {
    const supplied = req.get('x-request-id');
    const requestId = supplied && UUID_RE.test(supplied) ? supplied.toLowerCase() : crypto.randomUUID();
    const ipHash = auditHashKey && req.ip
      ? crypto.createHmac('sha256', auditHashKey).update(req.ip).digest('hex')
      : null;
    req.id = requestId;
    req.auditContext = {
      requestId,
      actorId: null,
      ipHash,
      userAgent: req.get('user-agent') ?? null
    };
    res.setHeader('x-request-id', requestId);
    res.setHeader('cache-control', 'no-store');
    next();
  };
}

export function attachActorContext(req, _res, next) {
  req.auditContext.actorId = req.actor.id;
  next();
}
