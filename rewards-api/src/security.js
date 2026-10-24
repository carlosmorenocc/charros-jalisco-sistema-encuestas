import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
export const digest = (value, key) => crypto.createHmac('sha256', key).update(value).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('base64url');

export async function hashPassword(password, pepper) {
  if (String(password).length < 12) throw new Error('La contraseña debe contener al menos 12 caracteres');
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(`${password}${pepper}`, salt, 64, { N: 32768, r: 8, p: 2 });
  return `scrypt$v=1$n=32768,r=8,p=2,l=64$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password, encoded, pepper) {
  const [, , , saltText, hashText] = String(encoded).split('$');
  if (!saltText || !hashText) return false;
  const expected = Buffer.from(hashText, 'base64url');
  const actual = await scrypt(`${password}${pepper}`, Buffer.from(saltText, 'base64url'), expected.length, { N: 32768, r: 8, p: 2 });
  return crypto.timingSafeEqual(expected, actual);
}

export { normalizeEmail };
