import { createHash } from 'node:crypto';
import { normalizeName } from './normalize.js';

export const PROMOTION_VERSION = 'initial-historical-v1';
export const PROMOTION_PIPELINE_RELEASE = '@charros/crm-staging-import@0.2.0';
export const PRIMARY_SHEET = 'CRM Prospectos';
export const PORTFOLIO_SHEET = 'Cartera Abonados';
export const AUXILIARY_CONTACT_SHEETS = new Set([
  'Fuente Encuesta Corta',
  'Fuente Encuesta Larga'
]);
export const CAMPAIGN_SHEET = 'Historial Envíos';

const CONTACT_STATUSES = new Set([
  'current_subscriber', 'renewing', 'new_subscriber', 'former_subscriber', 'prospect'
]);
const COMMERCIAL_STAGES = new Set([
  'unassigned', 'to_contact', 'contacted', 'follow_up', 'interested', 'reserved', 'won', 'lost'
]);

export function buildPromotionPlan(snapshot, {
  promotedBy,
  historicalCutoffAt,
  operationalCutoverAt
}) {
  validatePlanInput(snapshot, { promotedBy, historicalCutoffAt, operationalCutoverAt });
  const cutoff = new Date(historicalCutoffAt).toISOString();
  const cutover = new Date(operationalCutoverAt).toISOString();
  const records = [...snapshot.sourceRecords].sort(sourceOrder);
  const configVersions = new Set(records.map((record) => record.normalizedPayload?.schemaVersion).filter(Boolean));
  const configHashes = new Set(records.map((record) => record.normalizedPayload?.configSha256).filter(Boolean));
  if (configVersions.size !== 1 || configHashes.size !== 1) {
    throw promotionError('PROMOTION_CONFIG_PROVENANCE_AMBIGUOUS');
  }
  const recordById = new Map(records.map((record) => [record.id, record]));
  const candidateIndex = buildCandidateIndex(snapshot.matchCandidates ?? [], recordById);
  const identity = buildIdentityIndex(snapshot.canonicalContacts ?? [], snapshot.canonicalAliases ?? []);
  const externalRefs = new Set((snapshot.canonicalContacts ?? [])
    .map((contact) => contact.externalRef).filter(Boolean));
  const seasons = new Set(snapshot.seasons ?? []);
  const operations = [];
  const recordDecisions = new Map();
  const aliasKeys = new Set();
  const campaignIds = new Set();

  for (const record of records.filter((item) => item.sourceSheet === PRIMARY_SHEET)) {
    if (!isPending(record)) continue;
    const contact = firstEntity(record, 'contacts');
    if (!contact) {
      decide(recordDecisions, record, 'blocked', 'PRIMARY_CONTACT_PAYLOAD_MISSING');
      continue;
    }
    if (canonicalMatches(identity, contact).size > 0) {
      decide(recordDecisions, record, 'blocked', 'PRIMARY_CANONICAL_IDENTITY_COLLISION');
      continue;
    }
    if (contact.sourceId && externalRefs.has(contact.sourceId)) {
      decide(recordDecisions, record, 'blocked', 'PRIMARY_EXTERNAL_REF_COLLISION');
      continue;
    }
    const contactOperation = makeContactOperation(record, contact, {
      promotedBy, cutoff, cutover, aliases: entities(record, 'contact_aliases'),
      consents: entities(record, 'contact_consents'), memberships: [], nameStrategy: 'full'
    });
    if (contactOperation.error) {
      decide(recordDecisions, record, 'blocked', contactOperation.error);
      continue;
    }
    addContactOperations(operations, contactOperation, aliasKeys);
    addIdentity(identity, contactOperation.contact, record.id, contact.nameNormalized);
    if (contactOperation.contact.externalRef) externalRefs.add(contactOperation.contact.externalRef);
    decide(recordDecisions, record, 'created', contactOperation.reason, contactOperation.contact.id);
  }

  for (const record of records.filter((item) => item.sourceSheet === PORTFOLIO_SHEET)) {
    if (!isPending(record)) continue;
    const contact = firstEntity(record, 'contacts');
    if (!contact) {
      decide(recordDecisions, record, 'blocked', 'PORTFOLIO_CONTACT_PAYLOAD_MISSING');
      continue;
    }
    if (hasUnresolvedPortfolioCandidate(record.id, candidateIndex, recordById)) {
      decide(recordDecisions, record, 'blocked', 'PORTFOLIO_IDENTITY_MATCH_REQUIRES_REVIEW');
      continue;
    }
    if (canonicalMatches(identity, contact).size > 0) {
      decide(recordDecisions, record, 'blocked', 'PORTFOLIO_CANONICAL_IDENTITY_COLLISION');
      continue;
    }
    if (contact.sourceId && externalRefs.has(contact.sourceId)) {
      decide(recordDecisions, record, 'blocked', 'PORTFOLIO_EXTERNAL_REF_COLLISION');
      continue;
    }

    const memberships = entities(record, 'memberships');
    const isCurrent = contact.metadata?.subscriberStatus === 'current_subscriber';
    if (isCurrent && !validActiveMembership(memberships[0], seasons)) {
      decide(recordDecisions, record, 'blocked', 'CURRENT_PORTFOLIO_MEMBERSHIP_REQUIRES_REVIEW');
      continue;
    }
    const supportedMemberships = isCurrent ? [memberships[0]] : [];
    const contactOperation = makeContactOperation(record, contact, {
      promotedBy, cutoff, cutover, aliases: entities(record, 'contact_aliases'),
      consents: [], memberships: supportedMemberships,
      membershipUnits: entities(record, 'membership_units'),
      declaredTenureSeasons: memberships[0]?.seasonsCount ?? null,
      nameStrategy: 'first_token'
    });
    if (contactOperation.error) {
      decide(recordDecisions, record, 'blocked', contactOperation.error);
      continue;
    }
    addContactOperations(operations, contactOperation, aliasKeys);
    addIdentity(identity, contactOperation.contact, record.id, contact.nameNormalized);
    if (contactOperation.contact.externalRef) externalRefs.add(contactOperation.contact.externalRef);
    decide(recordDecisions, record, 'created', contactOperation.reason, contactOperation.contact.id);
  }

  // Auxiliary surveys never create a contact. Exact, unique identity may attach
  // aliases and historical consent events without changing the contact's current
  // consent/status or generating operational activity.
  const structuredNames = new Map();
  const auxiliaryRecords = records.filter((item) => AUXILIARY_CONTACT_SHEETS.has(item.sourceSheet));
  const unsafeStructuredNameIds = new Set();
  for (const record of auxiliaryRecords) {
    const contact = firstEntity(record, 'contacts');
    if (!contact) continue;
    const identityMatches = strictIdentityMatches(identity, contact);
    if (identityMatches.size !== 1) continue;
    const contactId = [...identityMatches][0];
    if (identity.contactMeta.get(contactId)?.nameNormalized !== contact.nameNormalized) {
      unsafeStructuredNameIds.add(contactId);
    }
  }
  for (const record of auxiliaryRecords) {
    if (!isPending(record)) continue;
    const contact = firstEntity(record, 'contacts');
    if (!contact) {
      decide(recordDecisions, record, 'ignored', 'AUXILIARY_CONTACT_PAYLOAD_MISSING');
      continue;
    }
    const matches = strictAuxiliaryMatches(identity, contact);
    if (matches.size === 0) {
      decide(recordDecisions, record, 'deferred', 'AUXILIARY_STRICT_IDENTITY_OR_NAME_MISMATCH');
      continue;
    }
    if (matches.size !== 1) {
      decide(recordDecisions, record, 'blocked', 'AUXILIARY_AMBIGUOUS_CANONICAL_MATCH');
      continue;
    }
    const contactId = [...matches][0];
    for (const alias of entities(record, 'contact_aliases').filter(validAlias)) {
      if (!aliasMayAttach(identity, alias, contactId, contact.nameNormalized)) continue;
      addAliasOperation(operations, aliasKeys, record, contactId, alias, cutoff, cutover);
    }
    for (const consent of entities(record, 'contact_consents')) {
      const historicalAt = strictSourceDate(consent.capturedAt, cutoff);
      if (!historicalAt) continue;
      operations.push({
        type: 'contact_consent', action: 'created', sourceRecordId: record.id,
        entityId: consent.id, historicalAt,
        data: { ...consent, contactId, recordedBy: promotedBy, createdAt: historicalAt }
      });
    }
    const split = structuredSplit(record, contact);
    if (split) {
      const candidates = structuredNames.get(contactId) ?? new Map();
      candidates.set(`${split.firstName}\u0000${split.lastName}`, split);
      structuredNames.set(contactId, candidates);
    }
    decide(recordDecisions, record, 'matched', 'AUXILIARY_EXACT_IDENTITY_LINK', contactId);
  }

  for (const operation of operations.filter((item) => item.type === 'contact')) {
    if (recordById.get(operation.sourceRecordId)?.sourceSheet !== PRIMARY_SHEET) continue;
    const candidates = structuredNames.get(operation.entityId);
    if (candidates?.size === 1 && !unsafeStructuredNameIds.has(operation.entityId)) {
      const split = [...candidates.values()][0];
      operation.data.firstName = split.firstName;
      operation.data.lastName = split.lastName;
      operation.data.nameStructure = 'auxiliary_consensus';
    } else {
      operation.data.nameStructure = candidates?.size > 1 || unsafeStructuredNameIds.has(operation.entityId)
        ? 'full_name_conflict_fallback'
        : 'full_name_fallback';
    }
  }

  for (const record of records.filter((item) => item.sourceSheet === CAMPAIGN_SHEET)) {
    if (!isPending(record)) continue;
    const message = firstEntity(record, 'campaign_messages');
    if (!message || !historicalCampaignMessage(message, cutoff)) {
      decide(recordDecisions, record, 'blocked', 'CAMPAIGN_MESSAGE_DATE_REQUIRES_REVIEW');
      continue;
    }
    for (const campaign of entities(record, 'campaigns')) {
      if (campaignIds.has(campaign.id)) continue;
      campaignIds.add(campaign.id);
      operations.push({
        type: 'campaign', action: 'created', sourceRecordId: record.id,
        entityId: campaign.id, historicalAt: strictSourceDate(message.sentAt, cutoff) ?? cutoff,
        data: { ...campaign, createdBy: promotedBy,
          createdAt: strictSourceDate(message.sentAt, cutoff) ?? cutoff }
      });
    }
    const messageIdentity = {
      emailNormalized: message.recipientNormalized,
      phoneNormalized: null
    };
    const matches = activeMatches(identity, messageIdentity);
    const contactId = matches.size === 1 ? [...matches][0] : null;
    const historicalAt = strictSourceDate(message.sentAt, cutoff);
    operations.push({
      type: 'campaign_message', action: 'created', sourceRecordId: record.id,
      entityId: message.id, historicalAt,
      data: { ...message, contactId, createdAt: historicalAt }
    });
    decide(recordDecisions, record, 'created', contactId
      ? 'CAMPAIGN_MESSAGE_EXACT_IDENTITY_LINK'
      : 'CAMPAIGN_MESSAGE_WITHOUT_UNIQUE_CONTACT', contactId);
  }

  for (const record of records) {
    if (recordDecisions.has(record.id)) continue;
    if (record.resolution === 'quarantined') {
      decide(recordDecisions, record, 'quarantined',
        record.resolutionReason ?? 'SOURCE_RECORD_QUARANTINED');
    } else if (record.resolution === 'pending_review') {
      decide(recordDecisions, record, 'deferred', 'ENTITY_TYPE_OUTSIDE_INITIAL_PROMOTION');
    } else {
      decide(recordDecisions, record, record.resolution,
        'SOURCE_RECORD_ALREADY_RESOLVED', record.contactId);
    }
  }

  const decisions = [...recordDecisions.values()].sort(sourceOrder);
  const metrics = buildMetrics(operations, decisions, records);
  const planSha256 = digestPlan({
    batchId: snapshot.batch.id,
    sourceSha256: snapshot.batch.sourceSha256,
    promotionVersion: PROMOTION_VERSION,
    pipelineRelease: PROMOTION_PIPELINE_RELEASE,
    configVersion: [...configVersions][0],
    configSha256: [...configHashes][0],
    historicalCutoffAt: cutoff,
    operationalCutoverAt: cutover,
    operations,
    decisions,
    metrics
  });
  return {
    batchId: snapshot.batch.id,
    sourceSha256: snapshot.batch.sourceSha256,
    promotionVersion: PROMOTION_VERSION,
    pipelineRelease: PROMOTION_PIPELINE_RELEASE,
    configVersion: [...configVersions][0],
    configSha256: [...configHashes][0],
    historicalCutoffAt: cutoff,
    operationalCutoverAt: cutover,
    promotedBy,
    planSha256,
    operations,
    decisions,
    metrics,
    alreadyPromoted: Boolean(snapshot.existingPromotion)
  };
}

function makeContactOperation(record, staged, options) {
  const name = String(staged.name ?? '').trim();
  if (!name) return { error: 'CONTACT_FULL_NAME_MISSING' };
  if (!staged.emailNormalized && !staged.phoneNormalized) return { error: 'CONTACT_IDENTITY_MISSING' };
  const status = staged.metadata?.subscriberStatus ?? 'prospect';
  const stage = staged.metadata?.commercialStage ?? 'unassigned';
  if (!CONTACT_STATUSES.has(status) || !COMMERCIAL_STAGES.has(stage)) {
    return { error: 'CONTACT_CLASSIFICATION_INVALID' };
  }
  const ownConsent = options.consents.find((event) => strictSourceDate(event.capturedAt, options.cutoff));
  const membership = options.memberships[0] ?? null;
  const historicalAt = firstHistoricalDate([
    ownConsent?.capturedAt,
    staged.metadata?.submittedAt,
    membership?.startedAt
  ], options.cutoff, options.cutoff);
  const nameParts = options.nameStrategy === 'first_token' ? splitFirstToken(name) : [name, ''];
  const contact = {
    id: staged.id,
    externalRef: staged.sourceId ?? null,
    firstName: nameParts[0],
    lastName: nameParts[1],
    email: staged.emailNormalized,
    phone: staged.phoneNormalized,
    municipality: staged.municipality,
    subscriberStatus: status,
    commercialStage: stage,
    preferredChannel: null,
    executiveId: null,
    source: staged.metadata?.origin ?? 'initial_historical_import',
    acquisitionSource: null,
    declaredTenureSeasons: options.declaredTenureSeasons ?? membership?.seasonsCount ?? null,
    consentStatus: ownConsent?.status === 'no' || ownConsent?.privacyNoticeVersion
      ? ownConsent.status
      : 'unknown',
    consentAt: ownConsent ? strictSourceDate(ownConsent.capturedAt, options.cutoff) : null,
    privacyNoticeVersion: ownConsent?.privacyNoticeVersion ?? null,
    summaryNotes: staged.metadata?.notes ?? null,
    lastHumanContactAt: null,
    nextFollowUpAt: null,
    createdBy: options.promotedBy,
    updatedBy: options.promotedBy,
    createdAt: historicalAt,
    updatedAt: historicalAt,
    nameStructure: options.nameStrategy === 'first_token' ? 'first_token_heuristic' : null
  };
  const operations = [{
    type: 'contact', action: 'created', sourceRecordId: record.id,
    entityId: contact.id, historicalAt, data: contact
  }];
  for (const alias of options.aliases.filter(validAlias)) {
    operations.push({ type: 'contact_alias_pending', record, contactId: contact.id, alias });
  }
  if (ownConsent) {
    operations.push({
      type: 'contact_consent', action: 'created', sourceRecordId: record.id,
      entityId: ownConsent.id, historicalAt: contact.consentAt,
      data: { ...ownConsent, contactId: contact.id, recordedBy: options.promotedBy,
        createdAt: contact.consentAt }
    });
  }
  if (membership) {
    const membershipAt = firstHistoricalDate([membership.startedAt], options.cutoff, options.cutoff);
    operations.push({
      type: 'membership', action: 'created', sourceRecordId: record.id,
      entityId: membership.id, historicalAt: membershipAt,
      data: { ...membership, contactId: contact.id, seatCount: membership.subscriptionCount,
        product: null, createdBy: options.promotedBy, updatedBy: options.promotedBy,
        createdAt: membershipAt, updatedAt: membershipAt }
    });
    const units = options.membershipUnits ?? [];
    if (units.length !== membership.subscriptionCount
      || units.some((unit, index) => unit.unitNumber !== index + 1)) {
      return { error: 'MEMBERSHIP_UNITS_NOT_SEQUENTIAL' };
    }
    for (const unit of units) {
      operations.push({
        type: 'membership_unit', action: 'created', sourceRecordId: record.id,
        entityId: unit.id, historicalAt: membershipAt,
        data: { ...unit, membershipId: membership.id, createdBy: options.promotedBy,
          updatedBy: options.promotedBy, createdAt: membershipAt, updatedAt: membershipAt }
      });
    }
  }
  return { contact, operations, reason: name.includes(' ')
    ? 'HISTORICAL_CONTACT_CREATED'
    : 'HISTORICAL_CONTACT_CREATED_SINGLE_TOKEN_NAME' };
}

function addContactOperations(target, bundle, aliasKeys) {
  for (const operation of bundle.operations) {
    if (operation.type === 'contact_alias_pending') {
      addAliasOperation(target, aliasKeys, operation.record, operation.contactId,
        operation.alias, bundle.contact.createdAt, '9999-12-31T00:00:00.000Z');
    } else target.push(operation);
  }
}

function addAliasOperation(target, aliasKeys, record, contactId, alias, fallbackAt, cutover) {
  const value = ['email', 'phone'].includes(alias.aliasType)
    ? alias.normalizedValue
    : alias.aliasValue;
  if (!value) return;
  const key = `${contactId}\u0000${alias.aliasType}\u0000${value}`;
  if (aliasKeys.has(key)) return;
  aliasKeys.add(key);
  const historicalAt = firstHistoricalDate([], cutover, fallbackAt);
  target.push({
    type: 'contact_alias', action: 'created', sourceRecordId: record.id,
    entityId: alias.id, historicalAt,
    data: { id: alias.id, contactId, aliasType: alias.aliasType, aliasValue: value,
      sourceSystem: record.sourceSheet, createdAt: historicalAt }
  });
}

function buildIdentityIndex(contacts, aliases) {
  const index = {
    email: new Map(),
    phone: new Map(),
    activeIds: new Set(),
    contactMeta: new Map(),
    canonicalOnly: null
  };
  for (const contact of contacts) {
    addIndex(index.email, normalizeEmail(contact.email), contact.id);
    addIndex(index.phone, normalizePhone(contact.phone), contact.id);
    if (!contact.deletedAt) index.activeIds.add(contact.id);
    index.contactMeta.set(contact.id, {
      nameNormalized: normalizeName(`${contact.firstName ?? ''} ${contact.lastName ?? ''}`),
      sourceRecordId: null
    });
  }
  for (const alias of aliases) {
    if (!['email', 'phone'].includes(alias.aliasType)) continue;
    const value = alias.aliasType === 'email'
      ? normalizeEmail(alias.aliasValue)
      : normalizePhone(alias.aliasValue);
    addIndex(index[alias.aliasType], value, alias.contactId);
  }
  index.canonicalOnly = cloneIdentityIndex(index);
  return index;
}

function cloneIdentityIndex(index) {
  return {
    email: new Map([...index.email].map(([key, ids]) => [key, new Set(ids)])),
    phone: new Map([...index.phone].map(([key, ids]) => [key, new Set(ids)]))
  };
}

function addIdentity(index, contact, sourceRecordId, nameNormalized) {
  addIndex(index.email, normalizeEmail(contact.email), contact.id);
  addIndex(index.phone, normalizePhone(contact.phone), contact.id);
  index.activeIds.add(contact.id);
  index.contactMeta.set(contact.id, { nameNormalized, sourceRecordId });
}

function canonicalMatches(index, contact) {
  const matches = new Set();
  for (const id of index.email.get(normalizeEmail(contact.emailNormalized ?? contact.email)) ?? []) matches.add(id);
  for (const id of index.phone.get(normalizePhone(contact.phoneNormalized ?? contact.phone)) ?? []) matches.add(id);
  return matches;
}

function activeMatches(index, contact) {
  return new Set([...canonicalMatches(index, contact)].filter((id) => index.activeIds.has(id)));
}

function strictAuxiliaryMatches(index, contact) {
  const identities = strictIdentityMatches(index, contact);
  return new Set([...identities].filter((id) =>
    index.contactMeta.get(id)?.nameNormalized === contact.nameNormalized));
}

function strictIdentityMatches(index, contact) {
  const matchedSets = [];
  const email = normalizeEmail(contact.emailNormalized ?? contact.email);
  const phone = normalizePhone(contact.phoneNormalized ?? contact.phone);
  if (email) {
    const ids = new Set([...(index.email.get(email) ?? [])].filter((id) => index.activeIds.has(id)));
    if (ids.size !== 1) return new Set();
    matchedSets.push(ids);
  }
  if (phone) {
    const ids = new Set([...(index.phone.get(phone) ?? [])].filter((id) => index.activeIds.has(id)));
    if (ids.size !== 1) return new Set();
    matchedSets.push(ids);
  }
  if (matchedSets.length === 0) return new Set();
  const target = [...matchedSets[0]][0];
  return matchedSets.every((ids) => ids.size === 1 && ids.has(target))
    ? new Set([target])
    : new Set();
}

function aliasMayAttach(index, alias, contactId, auxiliaryNameNormalized) {
  if (alias.aliasType === 'external_id') return true;
  if (alias.aliasType === 'name') {
    return alias.normalizedValue === auxiliaryNameNormalized
      && index.contactMeta.get(contactId)?.nameNormalized === auxiliaryNameNormalized;
  }
  const value = alias.aliasType === 'email'
    ? normalizeEmail(alias.normalizedValue)
    : normalizePhone(alias.normalizedValue);
  if (!value) return false;
  const ids = new Set([...(index[alias.aliasType].get(value) ?? [])]
    .filter((id) => index.activeIds.has(id)));
  return ids.size === 1 && ids.has(contactId);
}

function structuredSplit(record, contact) {
  const mapped = record.rawPayload?.mapped ?? {};
  const firstName = typeof mapped.name === 'string' ? mapped.name.trim() : '';
  const lastName = typeof mapped.last_name === 'string' ? mapped.last_name.trim() : '';
  if (!firstName || !lastName) return null;
  if (normalizeName(`${firstName} ${lastName}`) !== contact.nameNormalized) return null;
  return { firstName, lastName };
}

function historicalCampaignMessage(message, historicalCutoffAt) {
  if (!strictSourceDate(message.sentAt, historicalCutoffAt)) return false;
  return ['deliveredAt', 'openedAt', 'clickedAt', 'bouncedAt', 'unsubscribedAt']
    .every((field) => !message[field] || strictSourceDate(message[field], historicalCutoffAt));
}

function buildCandidateIndex(candidates, recordById) {
  const index = new Map();
  for (const candidate of candidates) {
    const left = recordById.get(candidate.leftSourceRecordId);
    const right = recordById.get(candidate.rightSourceRecordId);
    if (!left || !right) continue;
    for (const [record, other] of [[left, right], [right, left]]) {
      const list = index.get(record.id) ?? [];
      list.push({ ...candidate, otherSourceRecordId: other.id });
      index.set(record.id, list);
    }
  }
  return index;
}

function hasUnresolvedPortfolioCandidate(recordId, candidateIndex, recordById) {
  return (candidateIndex.get(recordId) ?? []).some((candidate) =>
    candidate.reviewStatus !== 'rejected'
      && [PRIMARY_SHEET, PORTFOLIO_SHEET].includes(
        recordById.get(candidate.otherSourceRecordId)?.sourceSheet
      ));
}

function validActiveMembership(membership, seasons) {
  return membership?.membershipStatus === 'active'
    && membership.seasonCode === 'LMP-2026-27'
    && seasons.has(membership.seasonCode)
    && Number.isInteger(membership.subscriptionCount)
    && membership.subscriptionCount >= 1
    && membership.subscriptionCount <= 100;
}

function buildMetrics(operations, decisions, sourceRecords = null) {
  const count = (type) => operations.filter((operation) => operation.type === type).length;
  const createdContacts = operations.filter((operation) => operation.type === 'contact');
  const statusCount = (status) => createdContacts.filter(
    (operation) => operation.data.subscriberStatus === status
  ).length;
  const stageCount = (stage) => createdContacts.filter(
    (operation) => operation.data.commercialStage === stage
  ).length;
  return Object.freeze({
    sourceRecordsTotal: sourceRecords?.length ?? decisions.length,
    sourceRecordsScanned: sourceRecords?.length ?? decisions.length,
    quarantinedRecords: sourceRecords?.filter((record) => record.resolution === 'quarantined').length ?? 0,
    recordsCreated: decisions.filter((item) => item.disposition === 'created').length,
    recordsMatched: decisions.filter((item) => item.disposition === 'matched').length,
    recordsIgnored: decisions.filter((item) => item.disposition === 'ignored').length,
    recordsBlocked: decisions.filter((item) => item.disposition === 'blocked').length,
    recordsDeferred: decisions.filter((item) => item.disposition === 'deferred').length,
    portfolioBlocked: decisions.filter((item) => item.sourceSheet === PORTFOLIO_SHEET
      && item.disposition === 'blocked').length,
    auxiliaryMatched: decisions.filter((item) => AUXILIARY_CONTACT_SHEETS.has(item.sourceSheet)
      && item.disposition === 'matched').length,
    auxiliaryDeferred: decisions.filter((item) => AUXILIARY_CONTACT_SHEETS.has(item.sourceSheet)
      && item.disposition === 'deferred').length,
    contactsCreated: count('contact'),
    currentContactsCreated: statusCount('current_subscriber'),
    formerContactsCreated: statusCount('former_subscriber'),
    prospectContactsCreated: statusCount('prospect'),
    contactedContactsCreated: stageCount('contacted'),
    toContactContactsCreated: stageCount('to_contact'),
    followUpContactsCreated: stageCount('follow_up'),
    unassignedContactsCreated: stageCount('unassigned'),
    consentYesContacts: createdContacts.filter(
      (operation) => operation.data.consentStatus === 'yes'
    ).length,
    consentNoContacts: createdContacts.filter(
      (operation) => operation.data.consentStatus === 'no'
    ).length,
    consentUnknownContacts: createdContacts.filter(
      (operation) => operation.data.consentStatus === 'unknown'
    ).length,
    structuredNamesCreated: createdContacts.filter(
      (operation) => operation.data.nameStructure === 'auxiliary_consensus'
    ).length,
    fullNameFallbacksCreated: createdContacts.filter(
      (operation) => String(operation.data.nameStructure ?? '').includes('fallback')
    ).length,
    aliasesCreated: count('contact_alias'),
    consentsCreated: count('contact_consent'),
    membershipsCreated: count('membership'),
    membershipUnitsCreated: count('membership_unit'),
    membershipsDeferred: sourceRecords
      ? sourceRecords.reduce((total, record) => total + entities(record, 'memberships').length, 0)
        - count('membership')
      : 0,
    tasksCreated: count('task'),
    interactionsCreated: count('interaction'),
    campaignsCreated: count('campaign'),
    campaignMessagesCreated: count('campaign_message'),
    campaignMessagesUnlinked: operations.filter((operation) => operation.type === 'campaign_message'
      && !operation.data.contactId).length
  });
}

function digestPlan(plan) {
  const safe = {
    ...plan,
    operations: plan.operations.map((operation) => ({
      type: operation.type, action: operation.action, sourceRecordId: operation.sourceRecordId,
      entityId: operation.entityId, contactId: operation.data?.contactId ?? null,
      historicalAt: operation.historicalAt,
      dataSha256: createHash('sha256').update(stableStringify(operation.data ?? null)).digest('hex')
    })),
    decisions: plan.decisions.map(({ id, sourceSheet, disposition, reason }) =>
      ({ id, sourceSheet, disposition, reason }))
  };
  return createHash('sha256').update(stableStringify(safe)).digest('hex');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function firstHistoricalDate(values, cutover, fallback) {
  for (const value of values) {
    const date = strictSourceDate(value, cutover);
    if (date) return date;
  }
  return new Date(new Date(fallback).getTime() - 1).toISOString();
}

function strictSourceDate(value, cutover, { allowAfterCutover = false } = {}) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (!allowAfterCutover && date.getTime() >= new Date(cutover).getTime()) return null;
  return date.toISOString();
}

function entities(record, name) {
  const value = record.normalizedPayload?.entities?.[name];
  return Array.isArray(value) ? value : [];
}

function firstEntity(record, name) {
  return entities(record, name)[0] ?? null;
}

function validAlias(alias) {
  return alias?.valid === true && ['email', 'phone', 'name', 'external_id'].includes(alias.aliasType);
}

function isPending(record) {
  return record.resolution === 'pending_review' && record.normalizedPayload;
}

function decide(map, record, disposition, reason, contactId = null) {
  map.set(record.id, {
    id: record.id,
    sourceSheet: record.sourceSheet,
    sourceRowNumber: record.sourceRowNumber,
    disposition,
    reason,
    contactId
  });
}

function sourceOrder(left, right) {
  return left.sourceSheet.localeCompare(right.sourceSheet, 'es-MX')
    || left.sourceRowNumber - right.sourceRowNumber
    || left.id.localeCompare(right.id);
}

function addIndex(index, key, id) {
  if (!key || !id) return;
  const ids = index.get(key) ?? new Set();
  ids.add(id);
  index.set(key, ids);
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

function normalizePhone(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  let digits = String(value).replace(/\D+/gu, '');
  if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2);
  if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3);
  return digits.length === 10 ? digits : null;
}

function splitFirstToken(name) {
  const parts = name.split(/\s+/u).filter(Boolean);
  return parts.length <= 1 ? [name, ''] : [parts[0], parts.slice(1).join(' ')];
}

function validatePlanInput(snapshot, options) {
  if (!snapshot?.batch?.id || !['validated', 'imported'].includes(snapshot.batch.status)) {
    throw promotionError('PROMOTION_BATCH_NOT_VALIDATED');
  }
  if (!Array.isArray(snapshot.sourceRecords)) throw promotionError('PROMOTION_SOURCE_RECORDS_REQUIRED');
  if (!options.promotedBy) throw promotionError('PROMOTION_ADMIN_REQUIRED');
  const cutoff = new Date(options.historicalCutoffAt);
  const cutover = new Date(options.operationalCutoverAt);
  if (Number.isNaN(cutoff.getTime()) || Number.isNaN(cutover.getTime()) || cutoff >= cutover) {
    throw promotionError('PROMOTION_HISTORICAL_WINDOW_INVALID');
  }
}

function promotionError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
