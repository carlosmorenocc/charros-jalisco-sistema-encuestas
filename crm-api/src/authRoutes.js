import express from 'express';
import { asyncHandler } from './lib/http.js';
import { authenticate, cookieValue, csrfProtection, requireTrustedOrigin } from './middleware/authenticate.js';
import { attachActorContext } from './middleware/requestContext.js';
import { authSessionPayload } from './security/LocalAuthService.js';

function data(res, value, status = 200) {
  return res.status(status).json({ data: value });
}

function sessionCookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: config.sessionAbsoluteTtlMs
  };
}

function csrfCookieOptions(config) {
  return { ...sessionCookieOptions(config), httpOnly: false };
}

function clearCookieOptions(config, { httpOnly }) {
  return {
    httpOnly,
    secure: config.sessionCookieSecure,
    sameSite: 'strict',
    path: '/'
  };
}

export function createAuthRouter({ authService, config }) {
  const router = express.Router();
  const sessionAuth = authenticate({ authService, cookieName: config.sessionCookieName });
  const csrf = csrfProtection({ authService, config });

  router.post('/login', requireTrustedOrigin(config), asyncHandler(async (req, res) => {
    const result = await authService.login(req.body, req.auditContext);
    res.cookie(config.sessionCookieName, result.sessionToken, sessionCookieOptions(config));
    res.cookie(config.csrfCookieName, result.csrfToken, csrfCookieOptions(config));
    data(res, {
      user: result.user,
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt,
      idleExpiresAt: result.idleExpiresAt
    });
  }));

  router.get('/session', sessionAuth, attachActorContext, asyncHandler(async (req, res) => {
    const csrfToken = await authService.refreshCsrf(
      req.authSession,
      cookieValue(req.get('cookie'), config.csrfCookieName)
    );
    res.cookie(config.csrfCookieName, csrfToken, csrfCookieOptions(config));
    data(res, authSessionPayload(req.authSession, csrfToken));
  }));

  router.post('/logout', sessionAuth, csrf, attachActorContext, asyncHandler(async (req, res) => {
    await authService.logout(req.authSessionToken, req.authSession, req.auditContext);
    res.clearCookie(config.sessionCookieName, clearCookieOptions(config, { httpOnly: true }));
    res.clearCookie(config.csrfCookieName, clearCookieOptions(config, { httpOnly: false }));
    res.status(204).end();
  }));

  return router;
}
