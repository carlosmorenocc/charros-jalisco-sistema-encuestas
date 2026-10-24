const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export function loadConfig() {
  const production = process.env.NODE_ENV === 'production';
  const config = {
    production,
    port: Number(process.env.PORT || 4100),
    databaseUrl: required('DATABASE_URL'),
    databaseSsl: process.env.DATABASE_SSL === 'true',
    corsOrigin: required('CORS_ORIGIN'),
    cookieSecure: process.env.SESSION_COOKIE_SECURE === 'true',
    sessionKey: required('SESSION_HASH_KEY'),
    passwordPepper: required('PASSWORD_PEPPER'),
    auditKey: required('AUDIT_HASH_KEY')
  };
  for (const key of ['sessionKey', 'passwordPepper', 'auditKey']) {
    if (config[key].length < 32) throw new Error(`${key} must contain at least 32 characters`);
  }
  if (production && (!config.cookieSecure || !config.corsOrigin.startsWith('https://'))) {
    throw new Error('Production requires secure cookies and an HTTPS CORS origin');
  }
  return config;
}
