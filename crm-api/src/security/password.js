import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);

export const SCRYPT_PARAMETERS = Object.freeze({
  N: 32_768,
  r: 8,
  p: 3,
  keyLength: 64,
  maxmem: 256 * 1024 * 1024
});

const HASH_PATTERN = /^scrypt\$v=1\$n=(\d+),r=(\d+),p=(\d+),l=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

function passwordMaterial(password, pepper) {
  return crypto.createHmac('sha256', pepper).update(password, 'utf8').digest();
}

async function derive(password, pepper, salt) {
  return scryptAsync(passwordMaterial(password, pepper), salt, SCRYPT_PARAMETERS.keyLength, {
    N: SCRYPT_PARAMETERS.N,
    r: SCRYPT_PARAMETERS.r,
    p: SCRYPT_PARAMETERS.p,
    maxmem: SCRYPT_PARAMETERS.maxmem
  });
}

export function assertPasswordPolicy(password) {
  if (typeof password !== 'string') throw new Error('BOOTSTRAP_ADMIN_PASSWORD is required.');
  const bytes = Buffer.byteLength(password, 'utf8');
  if (password.length < 14 || bytes > 256) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain 14 to 256 UTF-8 bytes.');
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)
    || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must include upper, lower, number, and symbol.');
  }
  return password;
}

export async function hashPassword(password, pepper) {
  assertPasswordPolicy(password);
  const salt = crypto.randomBytes(16);
  const derived = await derive(password, pepper, salt);
  return [
    'scrypt',
    'v=1',
    `n=${SCRYPT_PARAMETERS.N},r=${SCRYPT_PARAMETERS.r},p=${SCRYPT_PARAMETERS.p},l=${SCRYPT_PARAMETERS.keyLength}`,
    salt.toString('base64url'),
    Buffer.from(derived).toString('base64url')
  ].join('$');
}

export async function verifyPassword(password, encodedHash, pepper) {
  // Bound untrusted login input before invoking the intentionally expensive KDF.
  const safePassword = typeof password === 'string' && Buffer.byteLength(password, 'utf8') <= 256
    ? password
    : '';
  const match = typeof encodedHash === 'string' ? HASH_PATTERN.exec(encodedHash) : null;
  let salt = crypto.randomBytes(16);
  let expected = crypto.randomBytes(SCRYPT_PARAMETERS.keyLength);
  let supported = false;

  if (match) {
    const [, n, r, p, length, encodedSalt, encodedExpected] = match;
    supported = Number(n) === SCRYPT_PARAMETERS.N
      && Number(r) === SCRYPT_PARAMETERS.r
      && Number(p) === SCRYPT_PARAMETERS.p
      && Number(length) === SCRYPT_PARAMETERS.keyLength;
    if (supported) {
      try {
        salt = Buffer.from(encodedSalt, 'base64url');
        expected = Buffer.from(encodedExpected, 'base64url');
        supported = salt.length === 16 && expected.length === SCRYPT_PARAMETERS.keyLength;
      } catch {
        supported = false;
      }
    }
  }

  const actual = Buffer.from(await derive(safePassword, pepper, salt));
  return supported && safePassword.length > 0
    && expected.length === actual.length
    && crypto.timingSafeEqual(actual, expected);
}
