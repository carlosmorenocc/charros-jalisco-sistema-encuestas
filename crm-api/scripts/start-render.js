import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import {
  clearStartupAdminSecrets,
  ensureStartupAdmin
} from '../src/security/startupAdminBootstrap.js';

const config = loadConfig();
const pool = createPool(config);

try {
  const result = await ensureStartupAdmin({ pool, config });
  if (result.status === 'created') {
    process.stdout.write('Startup administrator created. Remove the three BOOTSTRAP_ADMIN_* variables now.\n');
  } else if (result.status === 'already_exists') {
    process.stdout.write('Startup administrator already exists; credentials were left unchanged.\n');
  } else {
    process.stdout.write('Startup administrator bootstrap is disabled.\n');
  }
} finally {
  // Render still retains the encrypted configuration until the operator removes
  // it, but the long-lived API process must not retain the raw bootstrap secret.
  clearStartupAdminSecrets(process.env);
  await pool.end();
}

// Import only after the bootstrap connection has closed. The API owns its own
// pool and signal handling for the remainder of the process lifetime.
await import('../src/server.js');
