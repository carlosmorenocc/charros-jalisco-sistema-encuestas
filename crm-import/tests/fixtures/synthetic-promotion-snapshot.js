import { createHash } from 'node:crypto';
import { deterministicId } from '../../src/identity.js';
import { normalizeName } from '../../src/normalize.js';

export const SYNTHETIC_HISTORICAL_CUTOFF_AT = '2026-08-21T21:24:23.329Z';
export const SYNTHETIC_OPERATIONAL_CUTOVER_AT = '2026-08-22T06:00:00.000Z';
export const SYNTHETIC_ADMIN_ID = '11111111-1111-4111-a111-111111111111';

export const EXPECTED_PROMOTION_METRICS = Object.freeze({
  sourceRecordsTotal: 7891,
  sourceRecordsScanned: 7891,
  quarantinedRecords: 4,
  recordsCreated: 4935,
  recordsMatched: 2627,
  recordsIgnored: 0,
  recordsBlocked: 20,
  recordsDeferred: 305,
  portfolioBlocked: 20,
  auxiliaryMatched: 2627,
  auxiliaryDeferred: 99,
  contactsCreated: 2727,
  currentContactsCreated: 118,
  formerContactsCreated: 139,
  prospectContactsCreated: 2470,
  toContactContactsCreated: 435,
  contactedContactsCreated: 2170,
  followUpContactsCreated: 26,
  unassignedContactsCreated: 96,
  consentYesContacts: 0,
  consentNoContacts: 497,
  consentUnknownContacts: 2230,
  structuredNamesCreated: 2486,
  fullNameFallbacksCreated: 43,
  aliasesCreated: 13535,
  consentsCreated: 5156,
  membershipsCreated: 96,
  membershipUnitsCreated: 96,
  membershipsDeferred: 122,
  interactionsCreated: 0,
  tasksCreated: 0,
  campaignsCreated: 3,
  campaignMessagesCreated: 2208,
  campaignMessagesUnlinked: 40
});

const CONFIG_VERSION = 'synthetic-2026-08-22.1';
const CONFIG_SHA256 = 'b'.repeat(64);
const SOURCE_SHA256 = 'a'.repeat(64);
const HISTORICAL_CONTACT_AT = '2026-08-02T00:00:00.000Z';
const HISTORICAL_CAMPAIGN_AT = '2026-08-19T16:00:00.000Z';

export function createSyntheticPromotionSnapshot() {
  const sourceRecords = [];
  const matchCandidates = [];
  const crm = [];
  const portfolio = [];

  for (let index = 0; index < 2529; index += 1) {
    const split = crmName(index);
    const sourceRecordId = uuid('crm-source', index);
    const contact = stagedContact({
      id: uuid('crm-contact', index),
      sourceRecordId,
      sourceId: `CRM-SYN-${pad(index)}`,
      name: split.fullName,
      email: `crm-${pad(index)}@example.test`,
      phone: phone(33, index),
      subscriberStatus: index < 22
        ? 'current_subscriber'
        : index < 59 ? 'former_subscriber' : 'prospect',
      commercialStage: index < 433 ? 'to_contact' : 'contacted',
      origin: 'Fuente sintética'
    });
    const consent = stagedConsent({
      sourceRecordId,
      contactId: contact.id,
      status: index < 497 ? 'no' : 'yes'
    });
    const record = pendingRecord({
      id: sourceRecordId,
      sourceSheet: 'CRM Prospectos',
      sourceRowNumber: index + 2,
      sourceId: contact.sourceId,
      entities: {
        contacts: [contact],
        contact_aliases: aliases(contact, 'CRM Prospectos'),
        contact_consents: [consent]
      }
    });
    crm.push({ contact, record, split });
    sourceRecords.push(record);
  }

  for (let index = 0; index < 218; index += 1) {
    const safe = index < 198;
    const current = index < 96 || !safe;
    const sourceRecordId = uuid('portfolio-source', index);
    const name = `Cartera Sintética ${pad(index)}`;
    const contact = stagedContact({
      id: uuid('portfolio-contact', index),
      sourceRecordId,
      sourceId: `PORT-SYN-${pad(index)}`,
      name,
      email: `portfolio-${pad(index)}@example.test`,
      phone: phone(34, index),
      subscriberStatus: current ? 'current_subscriber' : 'former_subscriber',
      commercialStage: current
        ? 'unassigned'
        : index < 170 ? 'contacted' : index < 196 ? 'follow_up' : 'to_contact',
      origin: 'Cartera sintética'
    });
    const membership = {
      id: uuid('membership', index),
      sourceRecordId,
      stagedContactId: contact.id,
      membershipStatus: current ? 'active' : 'expired',
      seasonCode: current ? 'LMP-2026-27' : null,
      sourceSeasonCode: current ? 'LMP 2026-2027' : null,
      seasonResolution: current ? 'normalized' : 'requires_review',
      reviewFlags: current ? [] : ['MISSING_SEASON_CODE'],
      seasonsCount: null,
      subscriptionCount: 1,
      zone: 'Zona sintética',
      renewedAt: null,
      startedAt: null,
      metadata: {}
    };
    const unit = {
      id: uuid('membership-unit', index),
      sourceRecordId,
      stagedMembershipId: membership.id,
      unitNumber: 1,
      seatIdentifier: null,
      zone: 'Zona sintética',
      product: null,
      jerseySize: null
    };
    const record = pendingRecord({
      id: sourceRecordId,
      sourceSheet: 'Cartera Abonados',
      sourceRowNumber: index + 2,
      sourceId: contact.sourceId,
      entities: {
        contacts: [contact],
        contact_aliases: aliases(contact, 'Cartera Abonados'),
        memberships: [membership],
        membership_units: [unit]
      }
    });
    portfolio.push({ contact, record });
    sourceRecords.push(record);
  }

  // Eighteen portfolio rows collide with CRM; the final two collide with each
  // other. Both sides of the portfolio pair stay in human review.
  for (let index = 0; index < 18; index += 1) {
    matchCandidates.push(candidate(
      portfolio[198 + index].record.id,
      crm[index].record.id,
      index
    ));
  }
  matchCandidates.push(candidate(portfolio[216].record.id, portfolio[217].record.id, 18));

  // All masters have at least one exact structured source. Fourteen contain two
  // contradictory splits. Another 29 are contaminated below by an exact-identity
  // survey whose name disagrees; those must also use the lossless full-name fallback.
  const surveySpecs = [];
  for (let index = 0; index < 2529; index += 1) {
    surveySpecs.push(surveyMatch(crm[index], crm[index].split.firstName, crm[index].split.lastName));
  }
  for (let index = 2486; index < 2500; index += 1) {
    const target = crm[index];
    surveySpecs.push(surveyMatch(target, `${target.split.firstName} Sintética`, String(index)));
  }
  for (let index = 0; index < 84; index += 1) {
    surveySpecs.push(surveyMatch(crm[index], crm[index].split.firstName, crm[index].split.lastName));
  }
  // 67 fail strict identifiers; another 32 have exact identifiers but a name
  // mismatch. Neither group may attach aliases or consent.
  for (let index = 0; index < 67; index += 1) {
    surveySpecs.push({
      name: `Auxiliar Diferido ${pad(index)}`,
      firstName: 'Auxiliar',
      lastName: `Diferido ${pad(index)}`,
      email: `deferred-${pad(index)}@example.test`,
      phone: phone(36, index)
    });
  }
  for (let index = 0; index < 32; index += 1) {
    const targetIndex = 2500 + (index % 29);
    surveySpecs.push({
      target: crm[targetIndex],
      name: `Nombre No Coincidente ${pad(index)}`,
      firstName: 'Nombre No',
      lastName: `Coincidente ${pad(index)}`,
      email: crm[targetIndex].contact.emailNormalized,
      phone: crm[targetIndex].contact.phoneNormalized
    });
  }

  surveySpecs.forEach((spec, index) => {
    const sourceRecordId = uuid('survey-source', index);
    const contact = stagedContact({
      id: uuid('survey-contact', index),
      sourceRecordId,
      sourceId: `SURVEY-SYN-${pad(index)}`,
      name: spec.name,
      email: spec.email,
      phone: spec.phone,
      subscriberStatus: 'prospect',
      commercialStage: 'unassigned',
      origin: 'Encuesta sintética'
    });
    const consent = stagedConsent({
      sourceRecordId,
      contactId: contact.id,
      status: index % 7 === 0 ? 'no' : 'yes'
    });
    sourceRecords.push(pendingRecord({
      id: sourceRecordId,
      sourceSheet: index < 2119 ? 'Fuente Encuesta Corta' : 'Fuente Encuesta Larga',
      sourceRowNumber: (index < 2119 ? index : index - 2119) + 2,
      sourceId: contact.sourceId,
      rawPayload: { mapped: { name: spec.firstName, last_name: spec.lastName } },
      entities: {
        contacts: [contact],
        contact_aliases: aliases(contact, index < 2119
          ? 'Fuente Encuesta Corta'
          : 'Fuente Encuesta Larga'),
        contact_consents: [consent]
      }
    }));
  });

  const campaignIds = [0, 1, 2].map((index) => uuid('campaign', index));
  for (let index = 0; index < 2208; index += 1) {
    const campaignIndex = index % 3;
    const sourceRecordId = uuid('campaign-source', index);
    const recipient = index < 2168
      ? crm[index].contact.emailNormalized
      : `unlinked-${pad(index)}@example.test`;
    const message = {
      id: uuid('campaign-message', index),
      sourceRecordId,
      sourceId: `MSG-SYN-${pad(index)}`,
      stagedCampaignId: campaignIds[campaignIndex],
      recipient: null,
      recipientNormalized: recipient,
      destinationHash: sha256(recipient),
      campaign: `Campaña sintética ${campaignIndex + 1}`,
      sentAt: HISTORICAL_CAMPAIGN_AT,
      deliveryStatus: null,
      deliveredAt: null,
      openedAt: null,
      clickedAt: null,
      bouncedAt: null,
      unsubscribedAt: null,
      providerId: null
    };
    const campaigns = index < 3 ? [{
      id: campaignIds[campaignIndex],
      sourceRecordId,
      name: `Campaña sintética ${campaignIndex + 1}`,
      channel: 'email'
    }] : [];
    sourceRecords.push(pendingRecord({
      id: sourceRecordId,
      sourceSheet: 'Historial Envíos',
      sourceRowNumber: index + 2,
      sourceId: message.sourceId,
      entities: { campaigns, campaign_messages: [message] }
    }));
  }

  // One quarantined portfolio row, three quarantined sales, and 206 explicitly
  // deferred non-contact entities reproduce the aggregate source reconciliation.
  sourceRecords.push(quarantinedRecord('Cartera Abonados', 220, 0));
  for (let index = 0; index < 206; index += 1) {
    sourceRecords.push(pendingRecord({
      id: uuid('deferred-source', index),
      sourceSheet: 'Entidad Diferida Sintética',
      sourceRowNumber: index + 2,
      sourceId: `DEFER-SYN-${pad(index)}`,
      entities: { deferred_entities: [{ id: uuid('deferred-entity', index) }] }
    }));
  }
  for (let index = 0; index < 3; index += 1) {
    sourceRecords.push(quarantinedRecord('Ventas Consolidadas', index + 2, index + 1));
  }

  if (sourceRecords.length !== 7891 || surveySpecs.length !== 2726) {
    throw new Error('SYNTHETIC_PROMOTION_FIXTURE_COUNT_ERROR');
  }
  return {
    batch: {
      id: uuid('batch', 0),
      sourceSha256: SOURCE_SHA256,
      status: 'validated',
      uploadedBy: SYNTHETIC_ADMIN_ID
    },
    sourceRecords,
    matchCandidates,
    canonicalContacts: [],
    canonicalAliases: [],
    seasons: ['LMP-2026-27'],
    existingPromotion: null
  };
}

function pendingRecord({
  id, sourceSheet, sourceRowNumber, sourceId, entities, rawPayload = { mapped: {} }
}) {
  return {
    id,
    sourceSheet,
    sourceRowNumber,
    sourceRecordId: sourceId,
    resolution: 'pending_review',
    resolutionReason: 'AWAITING_REVIEW',
    contactId: null,
    rawPayload,
    normalizedPayload: {
      schemaVersion: CONFIG_VERSION,
      configSha256: CONFIG_SHA256,
      entities
    }
  };
}

function quarantinedRecord(sourceSheet, sourceRowNumber, index) {
  return {
    id: uuid('quarantine-source', index),
    sourceSheet,
    sourceRowNumber,
    sourceRecordId: null,
    resolution: 'quarantined',
    resolutionReason: 'SYNTHETIC_QUARANTINE',
    contactId: null,
    rawPayload: {},
    normalizedPayload: null
  };
}

function stagedContact({
  id, sourceRecordId, sourceId, name, email, phone: phoneValue,
  subscriberStatus, commercialStage, origin
}) {
  return {
    id,
    sourceRecordId,
    recordType: 'synthetic',
    sourceId,
    name,
    nameNormalized: normalizeName(name),
    email,
    emailNormalized: email.toLowerCase(),
    emailValid: true,
    phone: phoneValue,
    phoneNormalized: phoneValue,
    phoneValid: true,
    municipality: 'Municipio sintético',
    metadata: {
      profile: null,
      origin,
      subscriberStatus,
      commercialStage,
      executive: null,
      legacyLastContactAt: null,
      legacyLastChannel: null,
      requiresHumanContactReview: false,
      nextFollowUpAt: null,
      zone: null,
      product: null,
      saleAt: null,
      salePeriod: null,
      notes: null,
      submittedAt: null,
      privacyAccepted: null,
      antiquity: null
    }
  };
}

function aliases(contact, sourceSystem) {
  return [
    alias(contact, 'external_id', contact.sourceId, contact.sourceId.toLowerCase(), sourceSystem),
    alias(contact, 'name', contact.name, contact.nameNormalized, sourceSystem),
    alias(contact, 'email', contact.email, contact.emailNormalized, sourceSystem),
    alias(contact, 'phone', contact.phone, contact.phoneNormalized, sourceSystem)
  ];
}

function alias(contact, aliasType, aliasValue, normalizedValue, sourceSystem) {
  return {
    id: uuid(`alias-${aliasType}-${contact.id}`, 0),
    sourceRecordId: contact.sourceRecordId,
    stagedContactId: contact.id,
    aliasType,
    aliasValue,
    normalizedValue,
    valid: true,
    primary: true,
    sourceSystem
  };
}

function stagedConsent({ sourceRecordId, contactId, status }) {
  return {
    id: uuid(`consent-${sourceRecordId}`, 0),
    sourceRecordId,
    stagedContactId: contactId,
    status,
    purpose: 'marketing',
    capturedAt: HISTORICAL_CONTACT_AT,
    source: 'Fuente sintética',
    privacyNoticeVersion: null,
    evidenceRef: sourceRecordId,
    rawDecision: status === 'yes' ? 'Sí' : 'No'
  };
}

function surveyMatch(target, firstName, lastName) {
  return {
    target,
    name: target.contact.name,
    firstName,
    lastName,
    email: target.contact.emailNormalized,
    phone: target.contact.phoneNormalized
  };
}

function candidate(leftSourceRecordId, rightSourceRecordId, index) {
  return {
    id: uuid('candidate', index),
    leftSourceRecordId,
    rightSourceRecordId,
    confidence: 'high',
    ruleCodes: ['EXACT_EMAIL', 'EXACT_PHONE'],
    reviewStatus: 'pending_review'
  };
}

function crmName(index) {
  return {
    firstName: 'Persona',
    lastName: `Sintética ${index}`,
    fullName: `Persona Sintética ${index}`
  };
}

function phone(prefix, index) {
  return `${prefix}${String(index).padStart(8, '0')}`;
}

function pad(index) {
  return String(index).padStart(5, '0');
}

function uuid(namespace, index) {
  return deterministicId('synthetic-promotion-fixture', namespace, index);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
