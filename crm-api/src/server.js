import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { createLogger } from './logger.js';
import { LocalAuthService } from './security/LocalAuthService.js';
import { PgCrmRepository } from './repositories/PgCrmRepository.js';
import { createApp } from './app.js';

const config = loadConfig();
const logger = createLogger(config);
const pool = createPool(config);
const repository = new PgCrmRepository(pool, {
  exportRowLimit: config.exportRowLimit
});
const authService = new LocalAuthService(repository, config);
const app = createApp({ config, repository, authService, logger });
const server = app.listen(config.port, () => {
  logger.info({ event: 'server.started', port: config.port }, 'CRM API listening');
});

async function shutdown(signal) {
  logger.info({ event: 'server.stopping', signal }, 'CRM API stopping');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
