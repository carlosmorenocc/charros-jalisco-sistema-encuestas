export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Autenticación requerida.') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'No tienes permiso para realizar esta acción.') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (entity = 'Recurso') =>
  new AppError(404, 'NOT_FOUND', `${entity} no encontrado.`);

export const conflict = (message, details) =>
  new AppError(409, 'CONFLICT', message, details);

export const duplicateContact = (matches) =>
  new AppError(409, 'DUPLICATE_CONTACT', 'Ya existe un contacto con el mismo correo o teléfono.', { matches });

export function assert(condition, error) {
  if (!condition) throw error;
}
