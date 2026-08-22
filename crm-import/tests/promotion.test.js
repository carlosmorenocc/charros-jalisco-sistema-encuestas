import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadSheetConfig } from '../src/config.js';
import { runPipeline } from '../src/pipeline.js';
import { buildStagingRecords } from '../src/staging-records.js';
import { buildPromotionPlan, PROMOTION_VERSION } from '../src/promotion-plan.js';
import { promotionIdentityKeys } from '../src/promotion-database.js';
import { parsePromotionArguments } from '../src/promotion-cli.js';
import {
  assertPromotionExpectations,
  PROMOTION_CRITICAL_METRICS,
  validatePromotionAuthorization
} from '../src/promotion-write-guard.js';

const ADMIN = '11111111-1111-4111-a111-111111111111';
const BATCH = '22222222-2222-4222-a222-222222222222';
const CUTOFF = '2026-08-21T21:24:23.329Z';
const CUTOVER = '2026-08-22T06:00:00.000Z';

async function fixtureSnapshot() {
  const [raw, config] = await Promise.all([
    readFile(fileURLToPath(new URL('./fixtures/synthetic-workbook.json', import.meta.url)), 'utf8'),
    loadSheetConfig()
  ]);
  const result = runPipeline({
    workbook: JSON.parse(raw),
    source: { sha256: 'a'.repeat(64), bytes: 1234 },
    config,
    generatedAt: new Date(CUTOFF)
  });
  return {
    batch: { id: BATCH, sourceSha256: result.source.sha256, status: 'validated' },
    sourceRecords: buildStagingRecords(result).map((record) => ({
      id: record.id,
      sourceSheet: record.sourceSheet,
      sourceRowNumber: record.sourceRowNumber,
      sourceRecordId: record.sourceRecordId,
      resolution: record.resolution,
      rawPayload: record.rawPayload,
      normalizedPayload: record.normalizedPayload
    })),
    matchCandidates: result.mergeCandidates.map((candidate) => ({
      leftSourceRecordId: candidate.leftSourceRecordId,
      rightSourceRecordId: candidate.rightSourceRecordId,
      confidence: candidate.confidence,
      reviewStatus: candidate.reviewStatus,
      ruleCodes: candidate.ruleCodes
    })),
    canonicalContacts: [],
    canonicalAliases: [],
    seasons: ['LMP-2026-27'],
    existingPromotion: null
  };
}

function plan(snapshot) {
  return buildPromotionPlan(snapshot, {
    promotedBy: ADMIN,
    historicalCutoffAt: CUTOFF,
    operationalCutoverAt: CUTOVER
  });
}

test('promueve sólo CRM primario y difiere una Cartera candidata sin autofusión', async () => {
  const result = plan(await fixtureSnapshot());
  assert.equal(result.promotionVersion, PROMOTION_VERSION);
  assert.equal(result.metrics.contactsCreated, 1);
  assert.equal(result.metrics.portfolioBlocked, 1);
  assert.equal(result.metrics.membershipsCreated, 0);
  assert.equal(result.metrics.auxiliaryMatched, 1);
  assert.equal(result.metrics.auxiliaryDeferred, 1);
  assert.equal(result.metrics.campaignsCreated, 1);
  assert.equal(result.metrics.campaignMessagesCreated, 1);
  assert.equal(result.metrics.campaignMessagesUnlinked, 0);
  assert.equal(result.operations.some((operation) => operation.type === 'interaction'), false);
  const contact = result.operations.find((operation) => operation.type === 'contact').data;
  assert.equal(contact.firstName, 'Ana Prueba');
  assert.equal(contact.lastName, '');
  assert.equal(contact.consentStatus, 'unknown', 'historical yes without notice version is not current yes');
  assert.equal(contact.lastHumanContactAt, null);
  assert.ok(new Date(contact.createdAt) <= new Date(CUTOFF));
});

test('una encuesta exige email, teléfono y nombre compatibles con el mismo contacto', async () => {
  const snapshot = await fixtureSnapshot();
  const survey = snapshot.sourceRecords.find((record) => record.sourceSheet === 'Fuente Encuesta Larga');
  const staged = survey.normalizedPayload.entities.contacts[0];
  if (staged.name === 'Ana Prueba') {
    staged.phoneNormalized = '3300000000';
    const alias = survey.normalizedPayload.entities.contact_aliases.find((item) => item.aliasType === 'phone');
    alias.normalizedValue = '3300000000';
  }
  const result = plan(snapshot);
  assert.equal(result.metrics.auxiliaryMatched, 0);
  assert.equal(result.metrics.auxiliaryDeferred, 2);
});

test('usa split estructurado sólo cuando auxiliares dan un consenso exacto', async () => {
  const snapshot = await fixtureSnapshot();
  const survey = snapshot.sourceRecords.find((record) =>
    record.sourceSheet === 'Fuente Encuesta Larga'
      && record.normalizedPayload?.entities?.contacts?.[0]?.name === 'Ana Prueba');
  survey.rawPayload.mapped.name = 'Ana';
  survey.rawPayload.mapped.last_name = 'Prueba';
  const result = plan(snapshot);
  const contact = result.operations.find((operation) => operation.type === 'contact').data;
  assert.equal(contact.firstName, 'Ana');
  assert.equal(contact.lastName, 'Prueba');
  assert.equal(result.metrics.structuredNamesCreated, 1);
});

test('el plan SHA cubre cambios de negocio sin exponer PII en su material público', async () => {
  const snapshot = await fixtureSnapshot();
  const original = plan(snapshot);
  const primary = snapshot.sourceRecords.find((record) => record.sourceSheet === 'CRM Prospectos'
    && record.normalizedPayload);
  primary.normalizedPayload.entities.contacts[0].metadata.commercialStage = 'follow_up';
  const changed = plan(snapshot);
  assert.notEqual(changed.planSha256, original.planSha256);
  assert.match(original.planSha256, /^[a-f0-9]{64}$/u);
});

test('locks incluyen identidades principales, aliases y campañas en orden estable', async () => {
  const keys = promotionIdentityKeys(await fixtureSnapshot());
  assert.deepEqual(keys, [...keys].sort());
  assert.ok(keys.includes('email:ana@example.test'));
  assert.ok(keys.includes('phone:3312345678'));
});

test('dry-run es predeterminado y commit exige SHA más métricas confirmadas', () => {
  const options = parsePromotionArguments(['--batch', BATCH]);
  assert.equal(options.commit, false);
  assert.deepEqual(validatePromotionAuthorization(options, {}), { mode: 'dry-run' });
  const committed = parsePromotionArguments([
    '--batch', BATCH, '--commit', '--confirm-plan', 'a'.repeat(64),
    ...PROMOTION_CRITICAL_METRICS.flatMap((metric) => [
      '--expect', `${metric}=${metric === 'contactsCreated' ? 2727 : 0}`
    ])
  ]);
  const authorization = validatePromotionAuthorization(committed, {
    CRM_PROMOTION_ENVIRONMENT: 'staging',
    CRM_PROMOTION_ALLOW_WRITE: 'true',
    CRM_PROMOTION_ADMIN_ID: ADMIN
  });
  assert.equal(authorization.mode, 'commit');
  assert.throws(() => assertPromotionExpectations({
    planSha256: 'b'.repeat(64), metrics: { contactsCreated: 2727 }
  }, authorization), /PROMOTION_PLAN_CHANGED/u);
});
