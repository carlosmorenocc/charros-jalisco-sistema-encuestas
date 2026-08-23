import crypto from 'node:crypto';
import { AppError, unauthorized } from '../lib/errors.js';
import { effectivePermissions } from './permissions.js';
import { verifyPassword } from './password.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const GENERIC_LOGIN_ERROR = 'Correo o contraseña incorrectos.';

function opaqueToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function safeEqualText(left, right) {
  const leftDigest = crypto.createHash('sha256').update(String(left ?? ''), 'utf8').digest();
  const rightDigest = crypto.createHash('sha256').update(String(right ?? ''), 'utf8').digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function publicUser(actor) {
  return {
    id: actor.id,
    email: actor.email,
    displayName: actor.displayName,
    role: actor.role,
    permissions: [...effectivePermissions(actor)].sort()
  };
}

export class LocalAuthService {
  constructor(repository, config) {
    this.repository = repository;
    this.config = config;
    this.activePasswordVerifications = 0;
    this.passwordVerificationQueue = [];
  }

  digest(value) {
    return crypto.createHmac('sha256', this.config.sessionHashKey).update(value, 'utf8').digest('hex');
  }

  async acquirePasswordVerificationSlot() {
    if (this.activePasswordVerifications < this.config.loginKdfConcurrency) {
      this.activePasswordVerifications += 1;
      return this.passwordVerificationRelease();
    }
    if (this.passwordVerificationQueue.length >= this.config.loginKdfQueueMax) {
      throw new AppError(429, 'LOGIN_BUSY', 'El acceso est\u00e1 temporalmente ocupado. Int\u00e9ntalo de nuevo.');
    }
    return new Promise((resolve) => this.passwordVerificationQueue.push(resolve));
  }

  passwordVerificationRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.passwordVerificationQueue.shift();
      if (next) next(this.passwordVerificationRelease());
      else this.activePasswordVerifications -= 1;
    };
  }

  async login(credentials, context) {
    const email = normalizeEmail(credentials?.email);
    const password = typeof credentials?.password === 'string' ? credentials.password : '';
    const ipKey = context?.ipHash && /^[0-9a-f]{64}$/.test(context.ipHash)
      ? context.ipHash
      : this.digest('missing-network-address');

    const throttle = await this.repository.consumeLoginIpAttempt(ipKey, {
      windowMs: this.config.loginRateLimitWindowMs,
      maxAttempts: this.config.loginRateLimitMax,
      blockMs: this.config.loginRateLimitBlockMs
    });
    if (!throttle.allowed) {
      throw new AppError(429, 'LOGIN_RATE_LIMITED', 'Demasiados intentos de acceso. Inténtalo más tarde.');
    }

    const validEmail = email.length <= 254
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      && email.endsWith(`@${this.config.localAdminDomain}`);
    const candidate = validEmail
      ? await this.repository.findLocalAdminForLogin(email)
      : null;
    const releasePasswordSlot = await this.acquirePasswordVerificationSlot();
    let passwordMatches;
    try {
      passwordMatches = await verifyPassword(password, candidate?.passwordHash, this.config.passwordPepper);
    } finally {
      releasePasswordSlot();
    }
    const now = Date.now();

    if (!candidate || !passwordMatches) {
      throw unauthorized(GENERIC_LOGIN_ERROR);
    }

    const sessionToken = opaqueToken();
    const csrfToken = opaqueToken();
    const expiresAt = new Date(now + this.config.sessionAbsoluteTtlMs);
    const idleExpiresAt = new Date(Math.min(
      expiresAt.getTime(),
      now + this.config.sessionIdleTtlMs
    ));

    await this.repository.recordLocalLoginSuccess(candidate.id);
    const session = await this.repository.createAuthSession({
      userId: candidate.id,
      tokenDigest: this.digest(sessionToken),
      csrfDigest: this.digest(csrfToken),
      expiresAt,
      idleExpiresAt,
      ipHash: context?.ipHash ?? null,
      userAgent: context?.userAgent?.slice(0, 500) ?? null
    });
    await this.repository.recordAuthEvent(candidate.id, context, 'auth.login_succeeded');
    await this.repository.clearLoginIpThrottle(ipKey);

    return {
      sessionToken,
      csrfToken,
      expiresAt: session.expiresAt ?? expiresAt,
      idleExpiresAt: session.idleExpiresAt ?? idleExpiresAt,
      user: publicUser(candidate)
    };
  }

  async authenticate(sessionToken) {
    if (typeof sessionToken !== 'string' || !TOKEN_PATTERN.test(sessionToken)) throw unauthorized();
    const session = await this.repository.findActiveAuthSession(
      this.digest(sessionToken),
      this.config.sessionIdleTtlMs
    );
    if (!session) throw unauthorized('La sesión expiró o no es válida.');
    return session;
  }

  async refreshCsrf(session, existingToken) {
    if (this.verifyCsrf(session, existingToken, existingToken)) return existingToken;
    const csrfToken = opaqueToken();
    const updated = await this.repository.rotateAuthSessionCsrf(session.id, this.digest(csrfToken));
    if (!updated) throw unauthorized('La sesión expiró o no es válida.');
    return csrfToken;
  }

  verifyCsrf(session, csrfToken, cookieToken) {
    const supplied = typeof csrfToken === 'string' ? csrfToken : '';
    const cookie = typeof cookieToken === 'string' ? cookieToken : '';
    const suppliedDigest = this.digest(supplied);
    const expected = Buffer.from(String(session?.csrfDigest ?? '').padEnd(64, '0').slice(0, 64), 'hex');
    const actual = Buffer.from(suppliedDigest, 'hex');
    return TOKEN_PATTERN.test(supplied)
      && TOKEN_PATTERN.test(cookie)
      && safeEqualText(supplied, cookie)
      && Boolean(session?.csrfDigest)
      && expected.length === actual.length
      && crypto.timingSafeEqual(expected, actual);
  }

  async logout(sessionToken, session, context) {
    if (typeof sessionToken === 'string' && TOKEN_PATTERN.test(sessionToken)) {
      await this.repository.revokeAuthSession(this.digest(sessionToken));
      if (session?.actor?.id) {
        await this.repository.recordAuthEvent(session.actor.id, context, 'auth.logout');
      }
    }
  }
}

export function authSessionPayload(session, csrfToken) {
  return {
    user: publicUser(session.actor),
    csrfToken,
    expiresAt: session.expiresAt,
    idleExpiresAt: session.idleExpiresAt
  };
}
