import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { IMPORTER_NAME, IMPORTER_VERSION } from './constants.js';

export function buildSanitizedReport(result, { mode, database = null } = {}) {
  return {
    reportType: 'crm_import_sanitized_audit',
    importer: { name: IMPORTER_NAME, version: IMPORTER_VERSION },
    generatedAt: result.generatedAt,
    mode: mode ?? 'dry-run',
    source: {
      sha256: result.source.sha256,
      bytes: result.source.bytes
    },
    configVersion: result.configVersion,
    configSha256: result.configSha256,
    reader: result.readerDiagnostics,
    sheets: result.sheetStats,
    totals: {
      sourceRows: result.sourceRows.length,
      contacts: result.contacts.length,
      aliases: result.aliases.length,
      consentEvents: result.consentEvents.length,
      memberships: result.memberships.length,
      membershipUnits: result.membershipUnits.length,
      interactions: result.interactions.length,
      sales: result.sales.length,
      saleItems: result.saleItems.length,
      payments: result.payments.length,
      catalogItems: result.catalogItems.length,
      campaigns: result.campaigns.length,
      campaignMessages: result.campaignMessages.length,
      rewardDefinitions: result.rewardDefinitions.length,
      rawSaleSourceRows: result.rawSaleSourceRows.length,
      mergeCandidates: result.mergeCandidates.length,
      quarantinedRows: result.quarantine.length
    },
    mergeCandidatesByConfidence: countBy(result.mergeCandidates, 'confidence'),
    qualityIssues: sortedObject(result.qualityIssues),
    quarantineReasons: sortedObject(result.quarantineReasons),
    controlledCorrections: sortedObject(result.corrections),
    commitReadiness: {
      ready: result.blockingIssues.length === 0,
      blockingIssueCodes: result.blockingIssues
    },
    database: database
      ? {
          batchId: database.batchId,
          status: database.status,
          insertedSourceRecords: database.insertedSourceRecords,
          insertedMatchCandidates: database.insertedMatchCandidates
        }
      : null,
    piiIncluded: false
  };
}

export function buildManifest(result, report, mode) {
  const reportJson = stableJson(report);
  return {
    manifestType: 'crm_import_manifest',
    importer: { name: IMPORTER_NAME, version: IMPORTER_VERSION },
    generatedAt: result.generatedAt,
    mode,
    sourceSha256: result.source.sha256,
    sourceBytes: result.source.bytes,
    configVersion: result.configVersion,
    configSha256: result.configSha256,
    reportSha256: createHash('sha256').update(reportJson).digest('hex'),
    sourceRows: result.sourceRows.length,
    quarantinedRows: result.quarantine.length,
    piiIncluded: false
  };
}

export async function writeSanitizedArtifacts({ report, manifest, outputDirectory }) {
  const directory = resolve(outputDirectory);
  await mkdir(directory, { recursive: true });
  const suffix = report.source.sha256.slice(0, 12);
  const reportPath = resolve(directory, `audit-${suffix}.json`);
  const manifestPath = resolve(directory, `manifest-${suffix}.json`);
  await writeFile(reportPath, `${stableJson(report)}\n`, { encoding: 'utf8', flag: 'w', mode: 0o600 });
  await writeFile(manifestPath, `${stableJson(manifest)}\n`, { encoding: 'utf8', flag: 'w', mode: 0o600 });
  return { reportPath, manifestPath };
}

export function stableJson(value) {
  return JSON.stringify(sortRecursively(value), null, 2);
}

function countBy(records, field) {
  const counts = {};
  for (const record of records) {
    const key = record[field] ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return sortedObject(counts);
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right)));
}

function sortRecursively(value) {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortRecursively(nested)])
  );
}
