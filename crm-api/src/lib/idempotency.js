import crypto from 'node:crypto';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function requestBodyHash(body, key) {
  return crypto.createHmac('sha256', key)
    .update('manual-registration:v1\0', 'utf8')
    .update(JSON.stringify(canonicalize(body)), 'utf8')
    .digest('hex');
}
