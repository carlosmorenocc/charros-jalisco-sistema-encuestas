import { AppError } from './errors.js';

export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export function requireRowVersion(req) {
  const raw = req.get('if-match');
  const match = /^(?:W\/)?"?(\d+)"?$/.exec(raw ?? '');
  if (!match) throw new AppError(428, 'PRECONDITION_REQUIRED', 'Envía If-Match con la versión actual del registro.');
  return Number(match[1]);
}

export function paginationMeta(page, pageSize, total) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
