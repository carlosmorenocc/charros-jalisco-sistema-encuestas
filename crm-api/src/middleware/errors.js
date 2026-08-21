import { AppError } from '../lib/errors.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `No existe ${req.method} ${req.path}.`));
}

export function errorHandler(config) {
  return function finalErrorHandler(error, req, res, _next) {
    let status = error instanceof AppError ? error.status : 500;
    let code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
    let message = error instanceof AppError ? error.message : 'Ocurrió un error interno.';

    if (error?.type === 'entity.parse.failed') {
      status = 400; code = 'INVALID_JSON'; message = 'El cuerpo JSON no es válido.';
    } else if (error?.type === 'entity.too.large') {
      status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'El cuerpo de la solicitud excede el límite permitido.';
    } else if (error?.code === '23505') {
      status = 409; code = 'DUPLICATE_RECORD'; message = 'Ya existe un registro con esos identificadores.';
    } else if (error?.code === '23503') {
      status = 409; code = 'RELATED_RECORD_CONFLICT'; message = 'La operación entra en conflicto con un registro relacionado.';
    } else if (error?.code === '23514' || error?.code === '22P02') {
      status = 400; code = 'INVALID_RECORD'; message = 'El registro no cumple las reglas de validación.';
    }

    if (status >= 500) {
      req.log?.error({
        requestId: req.id,
        errorType: error?.name ?? 'Error',
        errorCode: error?.code ?? 'UNKNOWN',
        stack: config.nodeEnv === 'production' ? undefined : error?.stack
      }, 'request failed');
    }

    res.status(status).json({
      error: {
        code,
        message,
        ...(error instanceof AppError && error.details ? { details: error.details } : {}),
        requestId: req.id
      }
    });
  };
}
