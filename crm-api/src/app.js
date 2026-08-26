import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { AppError } from './lib/errors.js';
import { requestContext, attachActorContext } from './middleware/requestContext.js';
import { authenticate, csrfProtection } from './middleware/authenticate.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { requestLogger } from './logger.js';
import { createAuthRouter } from './authRoutes.js';
import { createApiRouter } from './routes.js';
import { CrmService } from './services/CrmService.js';

export function createApp({ config, repository, authService, logger }) {
  const app = express();
  const service = new CrmService(repository);
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(requestContext(config.auditHashKey));
  app.use(requestLogger(logger));
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    // The authenticated SPA is on Vercel and the API is on Render.
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));
  app.use(cors({
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key', 'If-Match', 'X-CSRF-Token', 'X-Request-ID'],
    exposedHeaders: ['ETag', 'Idempotency-Replayed', 'X-Request-ID'],
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin.toLowerCase())) return callback(null, true);
      return callback(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'El origen del navegador no está autorizado.'));
    }
  }));
  app.use(rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Inténtalo más tarde.', requestId: req.id }
    })
  }));
  app.use('/api/v1/auth/login', express.json({ limit: '8kb', strict: true, type: 'application/json' }));
  app.use(express.json({ limit: config.jsonBodyLimit, strict: true, type: 'application/json' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'charros-crm-api' }));
  app.get('/ready', async (req, res) => {
    try {
      await repository.ready();
      res.json({ status: 'ready', release: 'dashboard-timeline-v1' });
    } catch (error) {
      req.log?.warn({ errorCode: error?.code ?? 'DB_UNAVAILABLE' }, 'readiness check failed');
      res.status(503).json({ status: 'unavailable', requestId: req.id });
    }
  });

  app.use('/api/v1/auth', createAuthRouter({ authService, config }));

  app.use('/api/v1',
    authenticate({ authService, cookieName: config.sessionCookieName }),
    csrfProtection({ authService, config }),
    attachActorContext,
    createApiRouter({ service, config })
  );

  app.use(notFoundHandler);
  app.use(errorHandler(config));
  return app;
}
