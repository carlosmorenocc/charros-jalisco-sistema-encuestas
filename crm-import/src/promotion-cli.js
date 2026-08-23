#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { commitPromotion, inspectPromotion } from './promotion-database.js';
import { buildPromotionReport } from './promotion-report.js';
import { validatePromotionAuthorization } from './promotion-write-guard.js';

export const DEFAULT_HISTORICAL_CUTOFF = '2026-08-21T21:24:23.329Z';
export const DEFAULT_OPERATIONAL_CUTOVER = '2026-08-22T06:00:00.000Z';

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parsePromotionArguments(argv);
  if (options.help) {
    process.stdout.write(`${helpText()}\n`);
    return;
  }
  if (!env.DATABASE_URL) throw cliError('PROMOTION_DATABASE_URL_REQUIRED');
  if (!env.CRM_PROMOTION_ADMIN_ID) throw cliError('PROMOTION_ADMIN_UUID_REQUIRED');
  const authorization = validatePromotionAuthorization(options, env);
  if (authorization.mode === 'dry-run') {
    const plan = await inspectPromotion({
      batchId: options.batchId,
      promotedBy: env.CRM_PROMOTION_ADMIN_ID,
      historicalCutoffAt: options.historicalCutoffAt,
      operationalCutoverAt: options.operationalCutoverAt,
      databaseUrl: env.DATABASE_URL
    });
    process.stdout.write(`${JSON.stringify(buildPromotionReport(plan, { mode: 'dry-run' }), null, 2)}\n`);
    return;
  }
  const database = await commitPromotion({
    batchId: options.batchId,
    promotedBy: authorization.promotedBy,
    historicalCutoffAt: options.historicalCutoffAt,
    operationalCutoverAt: options.operationalCutoverAt,
    authorization,
    databaseUrl: env.DATABASE_URL
  });
  // The commit result is already sanitized and deliberately contains counts and
  // opaque identifiers only. Never print the in-memory plan or source rows.
  process.stdout.write(`${JSON.stringify({
    reportType: 'crm_initial_historical_promotion_commit',
    piiIncluded: false,
    database
  }, null, 2)}\n`);
}

export function parsePromotionArguments(argv) {
  const options = {
    batchId: null,
    commit: false,
    explicitDryRun: false,
    confirmPlan: null,
    expectedMetrics: {},
    historicalCutoffAt: DEFAULT_HISTORICAL_CUTOFF,
    operationalCutoverAt: DEFAULT_OPERATIONAL_CUTOVER,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    switch (argv[index]) {
      case '--batch': options.batchId = value(argv, ++index, '--batch'); break;
      case '--commit': options.commit = true; break;
      case '--dry-run': options.explicitDryRun = true; break;
      case '--confirm-plan': options.confirmPlan = value(argv, ++index, '--confirm-plan').toLowerCase(); break;
      case '--expect': {
        const [metric, raw, ...extra] = value(argv, ++index, '--expect').split('=');
        const expected = Number(raw);
        if (!metric || extra.length || !Number.isSafeInteger(expected) || expected < 0) {
          throw cliError('PROMOTION_EXPECTATION_INVALID');
        }
        options.expectedMetrics[metric] = expected;
        break;
      }
      case '--historical-cutoff':
        options.historicalCutoffAt = iso(value(argv, ++index, '--historical-cutoff'));
        break;
      case '--operational-cutover':
        options.operationalCutoverAt = iso(value(argv, ++index, '--operational-cutover'));
        break;
      case '--help':
      case '-h': options.help = true; break;
      default: throw cliError('PROMOTION_UNKNOWN_ARGUMENT');
    }
  }
  if (options.help) return options;
  if (!/^[0-9a-f-]{36}$/iu.test(options.batchId ?? '')) throw cliError('PROMOTION_BATCH_UUID_REQUIRED');
  if (options.commit && options.explicitDryRun) throw cliError('PROMOTION_DRY_RUN_COMMIT_CONFLICT');
  if (!options.commit && (options.confirmPlan || Object.keys(options.expectedMetrics).length)) {
    throw cliError('PROMOTION_CONFIRMATION_ONLY_VALID_WITH_COMMIT');
  }
  if (new Date(options.historicalCutoffAt) >= new Date(options.operationalCutoverAt)) {
    throw cliError('PROMOTION_HISTORICAL_WINDOW_INVALID');
  }
  return options;
}

function helpText() {
  return `Uso seguro (dry-run predeterminado):
  npm run promote -- --batch <uuid>

Commit explícito (repite --expect por cada métrica revisada):
  npm run promote -- --batch <uuid> --commit --confirm-plan <sha256> --expect contactsCreated=2727

La ventana histórica acordada es ${DEFAULT_HISTORICAL_CUTOFF} y el corte operativo es
${DEFAULT_OPERATIONAL_CUTOVER}. Se pueden declarar explícitamente con
--historical-cutoff y --operational-cutover. El comando nunca imprime PII.`;
}

function value(argv, index, flag) {
  const item = argv[index];
  if (!item || item.startsWith('--')) throw cliError(`PROMOTION_${flag.slice(2).toUpperCase()}_VALUE_REQUIRED`);
  return item;
}

function iso(input) {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) throw cliError('PROMOTION_TIMESTAMP_INVALID');
  return parsed.toISOString();
}

function cliError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`Error seguro: ${error?.code ?? 'PROMOTION_FAILED'}\n`);
    process.exitCode = 1;
  });
}
