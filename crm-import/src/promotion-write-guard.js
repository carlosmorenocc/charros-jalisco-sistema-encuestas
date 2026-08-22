const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export const PROMOTION_CRITICAL_METRICS = Object.freeze([
  'sourceRecordsTotal', 'sourceRecordsScanned', 'quarantinedRecords',
  'recordsCreated', 'recordsMatched', 'recordsIgnored', 'recordsBlocked', 'recordsDeferred',
  'portfolioBlocked', 'auxiliaryMatched', 'auxiliaryDeferred',
  'contactsCreated', 'currentContactsCreated', 'formerContactsCreated',
  'prospectContactsCreated', 'contactedContactsCreated', 'toContactContactsCreated',
  'followUpContactsCreated', 'unassignedContactsCreated',
  'consentYesContacts', 'consentNoContacts', 'consentUnknownContacts',
  'structuredNamesCreated', 'fullNameFallbacksCreated', 'aliasesCreated',
  'consentsCreated', 'membershipsCreated', 'membershipUnitsCreated',
  'membershipsDeferred', 'tasksCreated', 'interactionsCreated',
  'campaignsCreated', 'campaignMessagesCreated', 'campaignMessagesUnlinked'
]);

export function validatePromotionAuthorization(options, env = process.env) {
  if (!options.commit) return { mode: 'dry-run' };
  if (env.CRM_PROMOTION_ENVIRONMENT !== 'staging') throw guarded('PROMOTION_REQUIRES_STAGING');
  if (env.CRM_PROMOTION_ALLOW_WRITE !== 'true') throw guarded('PROMOTION_WRITE_NOT_ENABLED');
  if (!UUID_PATTERN.test(env.CRM_PROMOTION_ADMIN_ID ?? '')) throw guarded('PROMOTION_ADMIN_UUID_REQUIRED');
  if (!SHA256_PATTERN.test(options.confirmPlan ?? '')) throw guarded('PROMOTION_PLAN_SHA_REQUIRED');
  const suppliedMetrics = Object.keys(options.expectedMetrics ?? {}).sort();
  const requiredMetrics = [...PROMOTION_CRITICAL_METRICS].sort();
  if (JSON.stringify(suppliedMetrics) !== JSON.stringify(requiredMetrics)) {
    throw guarded('PROMOTION_EXPECTED_METRICS_EXACT_SET_REQUIRED');
  }
  return {
    mode: 'commit',
    promotedBy: env.CRM_PROMOTION_ADMIN_ID,
    confirmPlan: options.confirmPlan,
    expectedMetrics: options.expectedMetrics
  };
}

export function criticalPromotionExpectations(metrics) {
  return Object.fromEntries(PROMOTION_CRITICAL_METRICS.map((metric) => [metric, metrics[metric]]));
}

export function assertPromotionExpectations(plan, authorization) {
  if (authorization.mode !== 'commit') return;
  if (plan.planSha256 !== authorization.confirmPlan) throw guarded('PROMOTION_PLAN_CHANGED');
  for (const [metric, expected] of Object.entries(authorization.expectedMetrics)) {
    if (!Object.hasOwn(plan.metrics, metric)) throw guarded('PROMOTION_EXPECTED_METRIC_UNKNOWN');
    if (plan.metrics[metric] !== expected) throw guarded('PROMOTION_EXPECTED_METRIC_MISMATCH');
  }
}

function guarded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
