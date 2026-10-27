const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export function loadConfig() {
  const production = process.env.NODE_ENV === 'production';
  const corsOrigins = String(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (!corsOrigins.length) throw new Error('Missing required environment variable: CORS_ORIGINS or CORS_ORIGIN');
  for (const origin of corsOrigins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
    if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`CORS origins must be exact HTTP(S) origins without paths: ${origin}`);
    }
  }
  const config = {
    production,
    port: Number(process.env.PORT || 4100),
    databaseUrl: required('DATABASE_URL'),
    databaseSsl: process.env.DATABASE_SSL === 'true',
    corsOrigins: [...new Set(corsOrigins)],
    cookieSecure: process.env.SESSION_COOKIE_SECURE === 'true',
    cookieSameSite: process.env.SESSION_COOKIE_SAME_SITE || (production ? 'none' : 'lax'),
    sessionKey: required('SESSION_HASH_KEY'),
    passwordPepper: required('PASSWORD_PEPPER'),
    auditKey: required('AUDIT_HASH_KEY')
  };
  for (const key of ['sessionKey', 'passwordPepper', 'auditKey']) {
    if (config[key].length < 32) throw new Error(`${key} must contain at least 32 characters`);
  }
  if (production && (!config.cookieSecure || !config.corsOrigins.every((origin) => origin.startsWith('https://')))) {
    throw new Error('Production requires secure cookies and an HTTPS CORS origin');
  }
  if (!['lax', 'strict', 'none'].includes(config.cookieSameSite)) {
    throw new Error('SESSION_COOKIE_SAME_SITE must be lax, strict or none');
  }
  if (config.cookieSameSite === 'none' && !config.cookieSecure) {
    throw new Error('SameSite=None requires secure cookies');
  }
  return config;
}
