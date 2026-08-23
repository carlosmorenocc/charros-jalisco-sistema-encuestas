import pino from 'pino';
import pinoHttp from 'pino-http';

export function createLogger(config) {
  return pino({
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.authorization', 'req.headers.cookie', 'headers.authorization',
        'req.headers.x-csrf-token', 'headers.cookie', 'headers.x-csrf-token',
        'token', '*.token', 'csrfToken', '*.csrfToken', 'password', '*.password',
        'email', '*.email', 'body', 'req.body', 'query'
      ],
      censor: '[REDACTED]'
    },
    base: { service: 'charros-crm-api', environment: config.nodeEnv }
  });
}

export function requestLogger(logger) {
  return pinoHttp({
    logger,
    genReqId: (req) => req.id,
    wrapSerializers: false,
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        path: String(req.originalUrl ?? req.url ?? '').split('?')[0]
      }),
      res: (res) => ({ statusCode: res.statusCode })
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    }
  });
}
