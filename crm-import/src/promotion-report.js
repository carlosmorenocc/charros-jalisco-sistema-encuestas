import { criticalPromotionExpectations } from './promotion-write-guard.js';

export function buildPromotionReport(plan, { mode, database = null } = {}) {
  const reasonCounts = {};
  for (const decision of plan.decisions) {
    reasonCounts[decision.reason] = (reasonCounts[decision.reason] ?? 0) + 1;
  }
  return {
    reportType: 'crm_initial_historical_promotion',
    promotionVersion: plan.promotionVersion,
    pipelineRelease: plan.pipelineRelease,
    configVersion: plan.configVersion,
    configSha256: plan.configSha256,
    mode: mode ?? 'dry-run',
    batchId: plan.batchId,
    sourceSha256: plan.sourceSha256,
    planSha256: plan.planSha256,
    historicalCutoffAt: plan.historicalCutoffAt,
    operationalCutoverAt: plan.operationalCutoverAt,
    historicalImport: true,
    piiIncluded: false,
    metrics: plan.metrics,
    requiredCommitExpectations: criticalPromotionExpectations(plan.metrics),
    reasonCounts: Object.fromEntries(Object.entries(reasonCounts).sort(([a], [b]) => a.localeCompare(b))),
    database
  };
}
