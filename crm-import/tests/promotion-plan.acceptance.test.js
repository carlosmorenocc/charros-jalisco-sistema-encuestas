import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPromotionPlan } from '../src/promotion-plan.js';
import { buildPromotionReport } from '../src/promotion-report.js';
import {
  createSyntheticPromotionSnapshot,
  EXPECTED_PROMOTION_METRICS,
  SYNTHETIC_ADMIN_ID,
  SYNTHETIC_HISTORICAL_CUTOFF_AT,
  SYNTHETIC_OPERATIONAL_CUTOVER_AT
} from './fixtures/synthetic-promotion-snapshot.js';

const snapshot = createSyntheticPromotionSnapshot();
const options = Object.freeze({
  promotedBy: SYNTHETIC_ADMIN_ID,
  historicalCutoffAt: SYNTHETIC_HISTORICAL_CUTOFF_AT,
  operationalCutoverAt: SYNTHETIC_OPERATIONAL_CUTOVER_AT
});
const plan = buildPromotionPlan(snapshot, options);

test('fija los conteos de aceptación del corte histórico sin crear operación diaria', () => {
  assert.deepEqual(plan.metrics, EXPECTED_PROMOTION_METRICS);
  assert.equal(operationCount('contact'), 2727);
  assert.equal(operationCount('membership'), 96);
  assert.equal(operationCount('membership_unit'), 96);
  assert.equal(operationCount('campaign'), 3);
  assert.equal(operationCount('campaign_message'), 2208);
  assert.equal(operationCount('interaction'), 0);
  assert.equal(operationCount('task'), 0);
  assert.equal(operationCount('sale'), 0);
});

test('mantiene 20 filas de cartera en revisión y difiere 99 encuestas no estrictas', () => {
  const portfolioBlocked = plan.decisions.filter((decision) =>
    decision.sourceSheet === 'Cartera Abonados' && decision.disposition === 'blocked');
  const auxiliaryMatched = plan.decisions.filter((decision) =>
    decision.sourceSheet.startsWith('Fuente Encuesta') && decision.disposition === 'matched');
  const auxiliaryDeferred = plan.decisions.filter((decision) =>
    decision.sourceSheet.startsWith('Fuente Encuesta') && decision.disposition === 'deferred');
  assert.equal(portfolioBlocked.length, 20);
  assert.equal(auxiliaryMatched.length, 2627);
  assert.equal(auxiliaryDeferred.length, 99);
});

test('estructura 2,486 nombres CRM por consenso y conserva 43 completos ante conflicto', () => {
  const crmContacts = plan.operations.filter((operation) =>
    operation.type === 'contact'
      && operation.data.externalRef?.startsWith('CRM-SYN-'));
  assert.equal(crmContacts.filter((operation) =>
    operation.data.nameStructure === 'auxiliary_consensus').length, 2486);
  const fallbacks = crmContacts.filter((operation) =>
    operation.data.nameStructure === 'full_name_conflict_fallback');
  assert.equal(fallbacks.length, 43);
  assert.ok(fallbacks.every((operation) =>
    operation.data.firstName.startsWith('Persona Sintética')
      && operation.data.lastName === ''));
});

test('consolida negativos y deja positivos sin versión legal como unknown', () => {
  const contacts = plan.operations
    .filter((operation) => operation.type === 'contact')
    .map((operation) => operation.data);
  assert.equal(contacts.filter((contact) => contact.consentStatus === 'no').length, 497);
  assert.equal(contacts.filter((contact) => contact.consentStatus === 'yes').length, 0);
  assert.equal(contacts.filter((contact) => contact.consentStatus === 'unknown').length, 2230);
  assert.equal(operationCount('contact_consent'), 5156);
});

test('vincula campañas sólo por correo exacto único y conserva 40 mensajes sin contacto', () => {
  const messages = plan.operations.filter((operation) => operation.type === 'campaign_message');
  assert.equal(messages.filter((message) => message.data.contactId).length, 2168);
  assert.equal(messages.filter((message) => !message.data.contactId).length, 40);
  assert.ok(messages.every((message) => message.data.recipientNormalized));
});

test('toda fecha de dominio queda antes del cutoff y ninguna alta aparece como hoy en México', () => {
  const historicalCutoff = Date.parse(SYNTHETIC_HISTORICAL_CUTOFF_AT);
  const mexicoTodayStart = Date.parse('2026-08-22T06:00:00.000Z');
  const domainOperations = plan.operations;
  const atOrAfterHistoricalCutoff = domainOperations.filter((operation) =>
    (operation.historicalAt && Date.parse(operation.historicalAt) >= historicalCutoff)
      || (operation.data.createdAt && Date.parse(operation.data.createdAt) >= historicalCutoff)
      || (operation.data.capturedAt && Date.parse(operation.data.capturedAt) >= historicalCutoff)
      || (operation.data.sentAt && Date.parse(operation.data.sentAt) >= historicalCutoff)).length;
  const createdToday = domainOperations.filter((operation) =>
    operation.data.createdAt && Date.parse(operation.data.createdAt) >= mexicoTodayStart).length;
  const occurredToday = domainOperations.filter((operation) =>
    operation.data.occurredAt && Date.parse(operation.data.occurredAt) >= mexicoTodayStart).length;
  const soldToday = domainOperations.filter((operation) =>
    operation.data.soldAt && Date.parse(operation.data.soldAt) >= mexicoTodayStart).length;
  assert.equal(atOrAfterHistoricalCutoff, 0);
  assert.equal(createdToday, 0);
  assert.equal(occurredToday, 0);
  assert.equal(soldToday, 0);
});

test('el reporte imprimible sólo contiene agregados y nunca PII del fixture', () => {
  const report = buildPromotionReport(plan, { mode: 'dry-run' });
  const serialized = JSON.stringify(report).toLocaleLowerCase('es-MX');
  for (const forbidden of [
    'persona sintética', 'cartera sintética', '@example.test', '3300000000'
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(report.piiIncluded, false);
  assert.deepEqual(report.metrics, EXPECTED_PROMOTION_METRICS);
});

test('el hash cambia si cambia un campo canónico aunque los conteos sean idénticos', () => {
  const changedSnapshot = structuredClone(snapshot);
  const crmRecord = changedSnapshot.sourceRecords.find((record) =>
    record.sourceSheet === 'CRM Prospectos' && record.normalizedPayload);
  crmRecord.normalizedPayload.entities.contacts[0].metadata.notes = 'Cambio sintético controlado';
  const changedPlan = buildPromotionPlan(changedSnapshot, options);
  assert.deepEqual(changedPlan.metrics, plan.metrics);
  assert.notEqual(changedPlan.planSha256, plan.planSha256);
});

function operationCount(type) {
  return plan.operations.filter((operation) => operation.type === type).length;
}
