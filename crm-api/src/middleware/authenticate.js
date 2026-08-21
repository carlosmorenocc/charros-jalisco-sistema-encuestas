import { forbidden, unauthorized } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function cookieValue(header, name) {
  const matches = String(header ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
    .map((part) => part.slice(name.length + 1));
  if (matches.length !== 1) return null;
  try {
    return decodeURIComponent(matches[0]);
  } catch {
    return null;
  }
}

export function authenticate({ authService, cookieName }) {
  return async function authenticationMiddleware(req, _res, next) {
    try {
      const token = cookieValue(req.get('cookie'), cookieName);
      if (!token) throw unauthorized();
      const session = await authService.authenticate(token);
      req.actor = session.actor;
      req.authSession = session;
      req.authSessionToken = token;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireTrustedOrigin(config) {
  return function trustedOriginMiddleware(req, _res, next) {
    const origin = String(req.get('origin') ?? '').toLowerCase();
    if (!origin || !config.corsOrigins.includes(origin)) {
      return next(forbidden('El origen de la solicitud no est\u00e1 autorizado.'));
    }
    return next();
  };
}

export function csrfProtection({ authService, config }) {
  const trustedOrigin = requireTrustedOrigin(config);
  return function csrfMiddleware(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    return trustedOrigin(req, res, (originError) => {
      if (originError) return next(originError);
      const csrfCookie = cookieValue(req.get('cookie'), config.csrfCookieName);
      if (!authService.verifyCsrf(req.authSession, req.get('x-csrf-token'), csrfCookie)) {
        return next(forbidden('La validaci\u00f3n de seguridad de la sesi\u00f3n fall\u00f3.'));
      }
      return next();
    });
  };
}
