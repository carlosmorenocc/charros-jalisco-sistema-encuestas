import { createHash } from 'node:crypto';
import {
  applyControlledCorrection,
  cleanText,
  isMeaningful,
  normalizeConsent,
  normalizeDate,
  normalizeDecimal,
  normalizeEmail,
  normalizeInteger,
  normalizeKey,
  normalizeName,
  normalizePhone,
  normalizeSeasonCode
} from './normalize.js';
import { buildMergeCandidates, deterministicId } from './identity.js';

export function runPipeline({ workbook, source, config, generatedAt = new Date() }) {
  validatePipelineInput(workbook, source, config);
  const result = createEmptyResult(source, config, generatedAt, workbook.readerDiagnostics);
  const sheetsByName = new Map(workbook.sheets.map((sheet) => [sheet.name, sheet]));
  const sourceIdRegistry = new Set();
  const catalogRegistry = new Set();
  const campaignRegistry = new Map();
  const rawSaleSignatureRegistry = new Map();

  for (const [sheetName, spec] of Object.entries(config.sheets)) {
    const sheet = sheetsByName.get(sheetName) ?? { name: sheetName, present: false, rows: [] };
    const sheetStats = createSheetStats(sheet, spec);
    result.sheetStats[sheetName] = sheetStats;

    if (!sheet.present) {
      increment(result.qualityIssues, 'CONFIGURED_SHEET_MISSING');
      continue;
    }
    if (sheet.headerError || sheet.headerRowNumber === null) {
      increment(result.qualityIssues, sheet.headerError ?? 'HEADER_NOT_FOUND');
      continue;
    }

    for (const row of sheet.rows) {
      sheetStats.rowsSeen += 1;
      const classification = classifyRow(row, spec);
      if (classification === 'blank') {
        sheetStats.rowsIgnoredBlank += 1;
        continue;
      }
      if (classification === 'formula_only') {
        sheetStats.rowsIgnoredFormulaOnly += 1;
        continue;
      }
      if (classification === 'non_material') {
        sheetStats.rowsIgnoredNonMaterial += 1;
        continue;
      }

      const sourceRecordId = deterministicId(source.sha256, sheetName, row.rowNumber);
      const explicitSourceId = cleanText(row.values.source_id ?? row.values.submission_id);
      const sourceIdKey = explicitSourceId
        ? `${sheetName}\u0000${normalizeKey(explicitSourceId) ?? explicitSourceId.toLocaleLowerCase('es-MX')}`
        : null;
      const sourceRow = {
        id: sourceRecordId,
        sourceSheet: sheetName,
        sourceRowNumber: row.rowNumber,
        sourceId: explicitSourceId,
        rawPayload: {
          mapped: serializeValues(row.values),
          source: serializeValues(row.raw ?? {})
        }
      };
      result.sourceRows.push(sourceRow);
      sheetStats.rowsAcceptedForReview += 1;

      if (sourceIdKey && sourceIdRegistry.has(sourceIdKey)) {
        quarantine(result, sourceRow, ['DUPLICATE_SOURCE_ID']);
        sheetStats.rowsQuarantined += 1;
        continue;
      }
      if (sourceIdKey) sourceIdRegistry.add(sourceIdKey);

      const beforeQuarantine = result.quarantine.length;
      transformRow({
        result,
        sourceRow,
        row,
        sheetName,
        spec,
        catalogRegistry,
        campaignRegistry,
        rawSaleSignatureRegistry
      });
      if (result.quarantine.length > beforeQuarantine) sheetStats.rowsQuarantined += 1;
      else sheetStats.rowsTransformed += 1;
    }
  }

  result.mergeCandidates = buildMergeCandidates(
    result.contacts,
    config.maximumIdentityGroupSize ?? 25,
    (issueCode) => increment(result.qualityIssues, issueCode)
  );
  result.blockingIssues = collectBlockingIssues(result);
  return result;
}

export function assertCommitReady(result) {
  const issues = result?.blockingIssues ?? collectBlockingIssues(result);
  if (issues.length > 0) {
    const error = new Error('PIPELINE_HAS_BLOCKING_ISSUES');
    error.code = 'PIPELINE_HAS_BLOCKING_ISSUES';
    throw error;
  }
}

function transformRow(context) {
  switch (context.spec.entity) {
    case 'contact':
    case 'contact_source':
      transformContact(context);
      break;
    case 'membership':
      transformMembership(context);
      break;
    case 'interaction':
      transformInteraction(context);
      break;
    case 'sale':
      transformSale(context);
      break;
    case 'catalog':
      transformCatalog(context);
      break;
    case 'campaign_message':
      transformCampaignMessage(context);
      break;
    case 'reward_definition':
      transformRewardDefinition(context);
      break;
    case 'raw_sale_source':
      transformRawSaleSource(context);
      break;
    default:
      throw new Error(`Entidad no implementada: ${context.spec.entity}`);
  }
}

function transformContact({ result, sourceRow, row, sheetName, spec }) {
  const contact = buildContact({ result, sourceRow, row, sheetName, spec });
  if (!contact) return;
  result.contacts.push(contact);
  addAliases(result, contact, row.values, sourceRow);
  addConsentEvent(result, contact, row.values, sourceRow);
}

function transformMembership(context) {
  const contact = buildContact(context);
  if (!contact) return;
  const { result, sourceRow, row } = context;
  result.contacts.push(contact);
  addAliases(result, contact, row.values, sourceRow);
  addConsentEvent(result, contact, row.values, sourceRow);

  const subscriptions = normalizeInteger(row.values.subscription_count);
  const seasonsCount = normalizeInteger(row.values.seasons_count);
  const season = normalizeSeasonCode(row.values.season_origin);
  if (season.correctionCode) increment(result.corrections, season.correctionCode);
  if (season.issueCode) increment(result.qualityIssues, `MEMBERSHIP_${season.issueCode}`);
  if (subscriptions === null) increment(result.qualityIssues, 'MEMBERSHIP_WITHOUT_SUBSCRIPTION_COUNT');
  if (subscriptions !== null && (subscriptions < 0 || subscriptions > 100)) {
    increment(result.qualityIssues, 'MEMBERSHIP_SUBSCRIPTION_COUNT_OUT_OF_RANGE');
  }
  const membershipId = deterministicId('membership', sourceRow.id);
  result.memberships.push({
    id: membershipId,
    sourceRecordId: sourceRow.id,
    stagedContactId: contact.id,
    membershipStatus: normalizeMembershipStatus(row.values.subscriber_status),
    seasonCode: season.code,
    sourceSeasonCode: season.sourceValue,
    seasonResolution: season.resolution,
    reviewFlags: season.issueCode ? [season.issueCode] : [],
    seasonsCount,
    subscriptionCount: subscriptions,
    zone: cleanText(row.values.zone),
    renewedAt: normalizeDate(row.values.renewed_at),
    startedAt: normalizeDate(row.values.started_at),
    metadata: {
      commercialStage: normalizeCommercialStage(row.values.commercial_stage),
      executive: cleanText(row.values.executive),
      legacyLastContactAt: normalizeDate(row.values.last_contact_at),
      legacyLastChannel: cleanText(row.values.last_channel),
      requiresHumanContactReview: isMeaningful(row.values.last_contact_at),
      nextFollowUpAt: normalizeDate(row.values.next_follow_up_at),
      notes: cleanText(row.values.notes)
    }
  });
  if (subscriptions !== null && subscriptions >= 1 && subscriptions <= 100) {
    for (let unitNumber = 1; unitNumber <= subscriptions; unitNumber += 1) {
      result.membershipUnits.push({
        id: deterministicId('membership-unit', sourceRow.id, unitNumber),
        sourceRecordId: sourceRow.id,
        stagedMembershipId: membershipId,
        unitNumber,
        seatIdentifier: null,
        zone: cleanText(row.values.zone),
        product: null,
        jerseySize: null
      });
    }
  }
}

function buildContact({ result, sourceRow, row, sheetName, spec }) {
  const email = normalizeEmail(row.values.email);
  const phone = normalizePhone(row.values.phone);
  const name = joinName(row.values.name, row.values.last_name);
  const explicitSourceId = cleanText(row.values.source_id ?? row.values.submission_id);
  if (!name && !email.raw && !phone.raw && !explicitSourceId) {
    quarantine(result, sourceRow, ['CONTACT_WITHOUT_IDENTITY']);
    return null;
  }
  if (email.raw && !email.valid) increment(result.qualityIssues, 'CONTACT_INVALID_EMAIL');
  if (phone.raw && !phone.valid) increment(result.qualityIssues, 'CONTACT_INVALID_PHONE');
  if (!email.valid && !phone.valid) {
    quarantine(result, sourceRow, ['CONTACT_WITHOUT_VALID_EMAIL_OR_PHONE']);
    return null;
  }
  if (!name) increment(result.qualityIssues, 'CONTACT_WITHOUT_NAME');
  else if ((normalizeName(name)?.split(' ').length ?? 0) < 2) {
    increment(result.qualityIssues, 'CONTACT_NAME_REQUIRES_REVIEW');
  }

  const antiquity = applyControlledCorrection({
    value: row.values.antiquity,
    sheetName,
    field: 'antiquity',
    spec
  });
  if (antiquity.correction) increment(result.corrections, antiquity.correction);

  return {
    id: deterministicId('contact', sourceRow.id),
    sourceRecordId: sourceRow.id,
    recordType: spec.recordType ?? spec.entity,
    sourceId: explicitSourceId,
    name,
    nameNormalized: normalizeName(name),
    email: email.raw,
    emailNormalized: email.valid ? email.normalized : null,
    emailValid: email.valid,
    phone: phone.raw,
    phoneNormalized: phone.valid ? phone.normalized : null,
    phoneValid: phone.valid,
    municipality: cleanText(row.values.municipality),
    metadata: {
      profile: cleanText(row.values.profile),
      origin: cleanText(row.values.origin),
      subscriberStatus: normalizeSubscriberStatus(
        row.values.subscriber_status ?? row.values.commercial_stage,
        spec.recordType
      ),
      commercialStage: normalizeCommercialStage(row.values.commercial_stage),
      executive: cleanText(row.values.executive),
      legacyLastContactAt: normalizeDate(row.values.last_contact_at),
      legacyLastChannel: cleanText(row.values.last_channel),
      requiresHumanContactReview: isMeaningful(row.values.last_contact_at),
      nextFollowUpAt: normalizeDate(row.values.next_follow_up_at),
      zone: cleanText(row.values.zone),
      product: cleanText(row.values.product),
      saleAt: normalizeDate(row.values.sale_at),
      salePeriod: cleanText(row.values.sale_period),
      notes: cleanText(row.values.notes),
      submittedAt: normalizeDate(row.values.submitted_at),
      privacyAccepted: normalizeConsent(row.values.privacy_accepted),
      antiquity: antiquity.value
    }
  };
}

function addAliases(result, contact, values, sourceRow) {
  const aliases = [];
  const sourceId = cleanText(values.source_id ?? values.submission_id);
  if (sourceId) aliases.push(aliasEntry('external_id', sourceId, normalizeKey(sourceId), true, true));
  const name = contact.name;
  if (name) aliases.push(aliasEntry('name', name, normalizeName(name), true, true));

  for (const [field, primary] of [['email', true], ['alternate_email', false]]) {
    const email = normalizeEmail(values[field]);
    if (email.raw) aliases.push(aliasEntry('email', email.raw, email.normalized, email.valid, primary));
  }
  for (const [field, primary] of [['phone', true], ['alternate_phone', false]]) {
    const phone = normalizePhone(values[field]);
    if (phone.raw) aliases.push(aliasEntry('phone', phone.raw, phone.normalized, phone.valid, primary));
  }

  for (const alias of aliases) {
    result.aliases.push({
      id: deterministicId('alias', contact.id, alias.type, alias.value),
      sourceRecordId: sourceRow.id,
      stagedContactId: contact.id,
      aliasType: alias.type,
      aliasValue: alias.value,
      normalizedValue: alias.normalizedValue,
      valid: alias.valid,
      primary: alias.primary,
      sourceSystem: sourceRow.sourceSheet
    });
  }
}

function addConsentEvent(result, contact, values, sourceRow) {
  if (!isMeaningful(values.consent)) return;
  const decision = normalizeConsent(values.consent);
  if (decision === 'unknown') increment(result.qualityIssues, 'CONSENT_VALUE_UNKNOWN');
  const observedAt = normalizeDate(values.consent_at ?? values.submitted_at);
  if (!observedAt) increment(result.qualityIssues, 'CONSENT_WITHOUT_VALID_DATE');
  result.consentEvents.push({
    id: deterministicId('consent', sourceRow.id),
    sourceRecordId: sourceRow.id,
    stagedContactId: contact.id,
    status: decision,
    purpose: 'marketing',
    capturedAt: observedAt,
    source: sourceRow.sourceSheet,
    privacyNoticeVersion: cleanText(values.privacy_version),
    evidenceRef: sourceRow.id,
    rawDecision: cleanText(values.consent)
  });
}

function transformInteraction({ result, sourceRow, row }) {
  const email = normalizeEmail(row.values.email);
  const phone = normalizePhone(row.values.phone);
  if (!cleanText(row.values.contact_ref) && !email.raw && !phone.raw) {
    quarantine(result, sourceRow, ['INTERACTION_WITHOUT_CONTACT_REFERENCE']);
    return;
  }
  const occurredAt = normalizeDate(row.values.occurred_at);
  if (!occurredAt) increment(result.qualityIssues, 'INTERACTION_WITHOUT_VALID_DATE');
  result.interactions.push({
    id: deterministicId('interaction', sourceRow.id),
    sourceRecordId: sourceRow.id,
    contactReference: cleanText(row.values.contact_ref),
    email: email.raw,
    emailNormalized: email.valid ? email.normalized : null,
    phone: phone.raw,
    phoneNormalized: phone.valid ? phone.normalized : null,
    occurredAt,
    channel: normalizeChannel(row.values.channel),
    sourceChannel: cleanText(row.values.channel),
    outcome: cleanText(row.values.result),
    executive: cleanText(row.values.executive),
    nextFollowUpAt: normalizeDate(row.values.next_follow_up_at),
    notes: cleanText(row.values.notes),
    isHumanContact: true
  });
}

function transformSale({ result, sourceRow, row }) {
  const units = normalizeInteger(row.values.units);
  const amount = normalizeDecimal(row.values.amount);
  if (units === null && amount === null) {
    quarantine(result, sourceRow, ['SALE_WITHOUT_UNITS_OR_AMOUNT']);
    return;
  }
  if ((units !== null && units < 0) || (amount !== null && amount < 0)) {
    quarantine(result, sourceRow, ['SALE_NEGATIVE_VALUE']);
    return;
  }
  if (units !== null && units > 0 && (amount === null || amount === 0)) {
    increment(result.qualityIssues, 'SALE_UNITS_WITHOUT_AMOUNT');
  }
  const saleId = deterministicId('sale', sourceRow.id);
  const soldAt = normalizeDate(row.values.sold_at);
  const season = normalizeSeasonCode(row.values.season);
  if (season.correctionCode) increment(result.corrections, season.correctionCode);
  if (season.issueCode) increment(result.qualityIssues, `SALE_${season.issueCode}`);
  const paymentParts = [
    ['cash', 'cash'],
    ['card', 'card'],
    ['transfer', 'transfer'],
    ['other_payment', 'other']
  ].map(([field, method]) => ({ method, amount: normalizeDecimal(row.values[field]) }))
    .filter((payment) => payment.amount !== null && payment.amount > 0);
  const paidAmount = roundCurrency(paymentParts.reduce((sum, payment) => sum + payment.amount, 0));
  if (paymentParts.length > 0 && !soldAt) {
    increment(result.qualityIssues, 'PAYMENT_WITHOUT_VALID_DATE');
  }
  if (amount !== null && paidAmount > amount) {
    increment(result.qualityIssues, 'SALE_PAYMENTS_EXCEED_TOTAL');
  }
  result.sales.push({
    id: saleId,
    sourceRecordId: sourceRow.id,
    sourceId: cleanText(row.values.source_id),
    contactReference: cleanText(row.values.contact_ref),
    soldAt,
    source: cleanText(row.values.source),
    seasonCode: season.code,
    sourceSeasonCode: season.sourceValue,
    seasonResolution: season.resolution,
    reviewFlags: season.issueCode ? [season.issueCode] : [],
    status: 'draft',
    currency: 'MXN',
    totalAmount: amount ?? 0,
    paidAmount,
    executive: cleanText(row.values.executive),
    notes: cleanText(row.values.notes),
    metadata: {
      units,
      product: cleanText(row.values.product),
      zone: cleanText(row.values.zone),
      outstandingOrCredit: normalizeDecimal(row.values.credit)
    }
  });
  if (units !== null && units > 0) {
    const documentedUnitPrice = normalizeDecimal(row.values.unit_price);
    result.saleItems.push({
      id: deterministicId('sale-item', sourceRow.id),
      sourceRecordId: sourceRow.id,
      stagedSaleId: saleId,
      product: cleanText(row.values.product) ?? 'Producto por revisar',
      zone: cleanText(row.values.zone),
      quantity: units,
      unitPrice: documentedUnitPrice ?? (amount === null ? null : roundCurrency(amount / units))
    });
  } else {
    increment(result.qualityIssues, 'SALE_WITHOUT_VALID_UNITS');
  }
  for (const [index, payment] of paymentParts.entries()) {
    result.payments.push({
      id: deterministicId('payment', sourceRow.id, payment.method, index),
      sourceRecordId: sourceRow.id,
      stagedSaleId: saleId,
      amount: payment.amount,
      method: payment.method,
      paidAt: soldAt,
      reference: cleanText(row.values.source_id)
    });
  }
}

function transformCatalog({ result, sourceRow, row, catalogRegistry }) {
  addSimpleCatalog(result, sourceRow, catalogRegistry, 'executive', row.values.executive);
  addSimpleCatalog(result, sourceRow, catalogRegistry, 'commercial_status', row.values.commercial_status);
  addSimpleCatalog(result, sourceRow, catalogRegistry, 'sale_period', row.values.sale_period);

  const product = cleanText(row.values.product);
  const zone = cleanText(row.values.zone);
  const price = normalizeDecimal(row.values.price);
  if (product || zone || price !== null) {
    const key = [normalizeKey(product), normalizeKey(zone), price ?? ''].join('|');
    addCatalog(result, sourceRow, catalogRegistry, {
      type: 'product_zone_price',
      key,
      label: product ?? zone ?? 'Precio sin producto',
      metadata: {
        product,
        zone,
        price,
        season: cleanText(row.values.season),
        effectiveFrom: normalizeDate(row.values.effective_from)
      }
    });
  }
}

function transformCampaignMessage({ result, sourceRow, row, campaignRegistry }) {
  const recipient = normalizeEmail(row.values.recipient);
  const campaign = cleanText(row.values.campaign);
  if (!recipient.raw || !campaign) {
    quarantine(result, sourceRow, ['CAMPAIGN_MESSAGE_INCOMPLETE']);
    return;
  }
  if (!recipient.valid) increment(result.qualityIssues, 'CAMPAIGN_RECIPIENT_INVALID_EMAIL');
  const sentAt = normalizeDate(row.values.sent_at);
  if (!sentAt) increment(result.qualityIssues, 'CAMPAIGN_WITHOUT_VALID_SENT_DATE');
  const campaignKey = normalizeKey(campaign);
  let campaignId = campaignRegistry.get(campaignKey);
  if (!campaignId) {
    campaignId = deterministicId('campaign', campaignKey);
    campaignRegistry.set(campaignKey, campaignId);
    result.campaigns.push({
      id: campaignId,
      sourceRecordId: sourceRow.id,
      name: campaign,
      channel: 'email'
    });
  }
  result.campaignMessages.push({
    id: deterministicId('campaign-message', sourceRow.id),
    sourceRecordId: sourceRow.id,
    sourceId: cleanText(row.values.source_id),
    stagedCampaignId: campaignId,
    recipient: recipient.raw,
    recipientNormalized: recipient.valid ? recipient.normalized : null,
    destinationHash: recipient.normalized
      ? hashNormalizedValue(recipient.normalized)
      : hashNormalizedValue(recipient.raw),
    campaign,
    sentAt,
    deliveryStatus: cleanText(row.values.delivery_status),
    deliveredAt: normalizeDate(row.values.delivered_at),
    openedAt: normalizeDate(row.values.opened_at),
    clickedAt: normalizeDate(row.values.clicked_at),
    bouncedAt: normalizeDate(row.values.bounced_at),
    unsubscribedAt: normalizeDate(row.values.unsubscribed_at),
    providerId: cleanText(row.values.provider_id)
  });
}

function transformRewardDefinition({ result, sourceRow, row }) {
  const condition = cleanText(row.values.condition);
  const reviewFlags = [];
  if (!condition) {
    reviewFlags.push('REWARD_CONDITION_MISSING');
    increment(result.qualityIssues, 'REWARD_CONDITION_MISSING');
  }
  result.rewardDefinitions.push({
    id: deterministicId('reward-definition', sourceRow.id),
    sourceRecordId: sourceRow.id,
    visitThreshold: normalizeInteger(row.values.visit),
    sourceVisitValue: cleanText(row.values.visit),
    reward: cleanText(row.values.reward),
    rewardType: cleanText(row.values.type),
    condition,
    resolution: 'requires_review',
    reviewFlags
  });
}

function transformRawSaleSource({ result, sourceRow, row, rawSaleSignatureRegistry }) {
  const normalized = {
    zone: cleanText(row.values.zone),
    type: cleanText(row.values.type),
    seats: normalizeInteger(row.values.seats),
    price: normalizeDecimal(row.values.price),
    cash: normalizeDecimal(row.values.cash),
    card: normalizeDecimal(row.values.card),
    other: normalizeDecimal(row.values.other),
    credit: normalizeDecimal(row.values.credit),
    commission: normalizeDecimal(row.values.commission),
    total: normalizeDecimal(row.values.total)
  };
  const signature = deterministicId(
    'raw-sale-source-signature',
    JSON.stringify(buildRawSaleSignatureValues(row.values))
  );
  const duplicateOfSourceRecordId = rawSaleSignatureRegistry.get(signature) ?? null;
  const reviewFlags = [];
  if (duplicateOfSourceRecordId) {
    reviewFlags.push('RAW_SALE_DUPLICATE_CANDIDATE');
    increment(result.qualityIssues, 'RAW_SALE_DUPLICATE_CANDIDATE');
  } else {
    rawSaleSignatureRegistry.set(signature, sourceRow.id);
  }
  if (!normalized.zone && !normalized.type && normalized.seats === null) {
    reviewFlags.push('RAW_SALE_STRUCTURAL_ROW_CANDIDATE');
    increment(result.qualityIssues, 'RAW_SALE_STRUCTURAL_ROW_CANDIDATE');
  }
  result.rawSaleSourceRows.push({
    id: deterministicId('raw-sale-source', sourceRow.id),
    sourceRecordId: sourceRow.id,
    ...normalized,
    signature,
    duplicateOfSourceRecordId,
    resolution: 'requires_review',
    reviewFlags
  });
}

function addSimpleCatalog(result, sourceRow, registry, type, value) {
  const label = cleanText(value);
  if (!label) return;
  addCatalog(result, sourceRow, registry, {
    type,
    key: normalizeKey(label),
    label,
    metadata: {}
  });
}

function addCatalog(result, sourceRow, registry, item) {
  const registryKey = `${item.type}\u0000${item.key}`;
  if (!item.key || registry.has(registryKey)) return;
  registry.add(registryKey);
  result.catalogItems.push({
    id: deterministicId('catalog', item.type, item.key),
    sourceRecordId: sourceRow.id,
    catalogType: item.type,
    catalogKey: item.key,
    label: item.label,
    metadata: item.metadata
  });
}

function classifyRow(row, spec) {
  const mappedEntries = Object.entries(row.values ?? {}).filter(([, value]) => isMeaningful(value));
  const rawEntries = Object.entries(row.raw ?? {}).filter(([, value]) => isMeaningful(value));
  if (mappedEntries.length === 0 && rawEntries.length === 0) {
    return row.hasAnyFormula || (row.formulaFields?.length ?? 0) > 0 ? 'formula_only' : 'blank';
  }

  const formulaFields = new Set(row.formulaFields ?? []);
  const meaningfulMappedFields = mappedEntries.map(([field]) => field);
  const hasNonFormulaMaterial = spec.materialFields.some(
    (field) => isMeaningful(row.values?.[field]) && !formulaFields.has(field)
  );
  if (hasNonFormulaMaterial) return 'material';
  if (
    meaningfulMappedFields.length > 0
    && meaningfulMappedFields.every((field) => formulaFields.has(field))
  ) return 'formula_only';
  return 'non_material';
}

function quarantine(result, sourceRow, reasonCodes) {
  const uniqueReasons = [...new Set(reasonCodes)].sort();
  result.quarantine.push({
    id: deterministicId('quarantine', sourceRow.id, uniqueReasons.join('|')),
    sourceRecordId: sourceRow.id,
    sourceSheet: sourceRow.sourceSheet,
    sourceRowNumber: sourceRow.sourceRowNumber,
    reasonCodes: uniqueReasons,
    rawPayload: sourceRow.rawPayload
  });
  for (const reason of uniqueReasons) increment(result.quarantineReasons, reason);
}

function createEmptyResult(source, config, generatedAt, readerDiagnostics) {
  return {
    source: { sha256: source.sha256, bytes: source.bytes },
    configVersion: config.version,
    configSha256: config.sha256 ?? null,
    generatedAt: generatedAt.toISOString(),
    readerDiagnostics: readerDiagnostics ?? {
      mode: 'normalized_fixture',
      fallbackReason: null,
      originalBufferModified: false
    },
    sourceRows: [],
    contacts: [],
    aliases: [],
    consentEvents: [],
    memberships: [],
    membershipUnits: [],
    interactions: [],
    sales: [],
    saleItems: [],
    payments: [],
    catalogItems: [],
    campaigns: [],
    campaignMessages: [],
    rewardDefinitions: [],
    rawSaleSourceRows: [],
    mergeCandidates: [],
    quarantine: [],
    sheetStats: {},
    qualityIssues: {},
    quarantineReasons: {},
    corrections: {},
    blockingIssues: []
  };
}

function createSheetStats(sheet, spec) {
  return {
    present: Boolean(sheet.present),
    headerDetected: sheet.headerRowNumber !== null && !sheet.headerError,
    entity: spec.entity,
    rowsSeen: 0,
    rowsIgnoredBlank: 0,
    rowsIgnoredFormulaOnly: 0,
    rowsIgnoredNonMaterial: 0,
    rowsAcceptedForReview: 0,
    rowsTransformed: 0,
    rowsQuarantined: 0
  };
}

function aliasEntry(type, value, normalizedValue, valid, primary) {
  return { type, value, normalizedValue, valid, primary };
}

function serializeValues(values) {
  return Object.fromEntries(
    Object.entries(values ?? {}).map(([key, value]) => [
      key,
      serializeValue(value)
    ])
  );
}

function serializeValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return cleanText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value === null) return value;
  if (value === undefined) return null;
  return cleanText(value);
}

function increment(target, key, amount = 1) {
  target[key] = (target[key] ?? 0) + amount;
}

function normalizeSubscriberStatus(value, recordType) {
  const key = normalizeKey(value);
  if (!key) return recordType === 'portfolio' ? 'renewing' : 'prospect';
  if (key.includes('abonado actual') || ['actual', 'renovado'].includes(key)) {
    return 'current_subscriber';
  }
  if (key.includes('por renovar') || key.includes('renovacion')) return 'renewing';
  if (key.includes('abonado nuevo') || key === 'nuevo') return 'new_subscriber';
  if (key.includes('exabonado') || key.includes('ex abonado')) return 'former_subscriber';
  return 'prospect';
}

function normalizeCommercialStage(value) {
  const key = normalizeKey(value);
  if (!key) return 'unassigned';
  if (key.includes('abonado actual identificado')) return 'contacted';
  if (key.includes('sin asignar')) return 'unassigned';
  if (key.includes('sin contactar') || key.includes('por contactar')) return 'to_contact';
  if (key === 'contactado' || key.includes('contactado')) return 'contacted';
  if (key.includes('seguimiento')) return 'follow_up';
  if (key.includes('interesado')) return key.includes('no interesado') ? 'lost' : 'interested';
  if (key.includes('apartado') || key.includes('reservado')) return 'reserved';
  if (key.includes('ganado') || key.includes('vendido') || key.includes('renovado')) return 'won';
  if (key.includes('perdido') || key.includes('numero incorrecto')) return 'lost';
  return 'unassigned';
}

function normalizeMembershipStatus(value) {
  const key = normalizeKey(value);
  if (!key) return 'renewing';
  if (key.includes('cancel')) return 'cancelled';
  if (key.includes('exabonado') || key.includes('vencido')) return 'expired';
  if (key.includes('por renovar') || key.includes('renovacion')) return 'renewing';
  if (key.includes('actual') || key.includes('renovado') || key.includes('activo')) return 'active';
  return 'renewing';
}

function normalizeChannel(value) {
  const key = normalizeKey(value);
  if (!key) return 'other';
  if (key.includes('whatsapp')) return 'whatsapp';
  if (key.includes('correo') || key.includes('email')) return 'email';
  if (key.includes('presencial') || key.includes('persona')) return 'in_person';
  if (key.includes('llamada') || key.includes('telefono')) return 'phone';
  return 'other';
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function hashNormalizedValue(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex');
}

function joinName(firstOrFullName, lastName) {
  const first = cleanText(firstOrFullName);
  const last = cleanText(lastName);
  if (!first) return last;
  if (!last) return first;
  return `${first} ${last}`;
}

function buildRawSaleSignatureValues(values) {
  return [
    'zone',
    'type',
    'seats',
    'price',
    'cash',
    'card',
    'other',
    'credit',
    'commission',
    'total'
  ].map((field) => {
    const value = values?.[field];
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return cleanText(value);
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean' || value === null) return value;
    return value === undefined ? null : cleanText(value);
  });
}

function validatePipelineInput(workbook, source, config) {
  if (!workbook || !Array.isArray(workbook.sheets)) throw new Error('Workbook normalizado inválido.');
  if (!source || !/^[a-f0-9]{64}$/u.test(source.sha256) || !Number.isSafeInteger(source.bytes)) {
    throw new Error('Metadatos de archivo fuente inválidos.');
  }
  if (!config?.sheets || !config.version) throw new Error('Configuración inválida.');
}

function collectBlockingIssues(result) {
  const issues = [];
  for (const stats of Object.values(result?.sheetStats ?? {})) {
    if (!stats.present) issues.push('REQUIRED_SHEET_MISSING');
    else if (!stats.headerDetected) issues.push('REQUIRED_HEADER_NOT_DETECTED');
  }
  if ((result?.sourceRows?.length ?? 0) === 0) issues.push('NO_IMPORTABLE_SOURCE_ROWS');
  return [...new Set(issues)].sort();
}
