import { createHash } from 'node:crypto';

const ENTITY_COLLECTIONS = [
  ['contacts', 'contacts'],
  ['aliases', 'contact_aliases'],
  ['consentEvents', 'contact_consents'],
  ['memberships', 'memberships'],
  ['membershipUnits', 'membership_units'],
  ['interactions', 'interactions'],
  ['sales', 'sales'],
  ['saleItems', 'sale_items'],
  ['payments', 'payments'],
  ['catalogItems', 'catalog_items'],
  ['campaigns', 'campaigns'],
  ['campaignMessages', 'campaign_messages'],
  ['rewardDefinitions', 'reward_definitions'],
  ['rawSaleSourceRows', 'raw_sale_source_rows']
];

export function buildStagingRecords(result) {
  const entitiesBySourceRecord = new Map();
  for (const [collectionName, entityName] of ENTITY_COLLECTIONS) {
    for (const item of result[collectionName] ?? []) {
      const grouped = entitiesBySourceRecord.get(item.sourceRecordId) ?? {};
      const entities = grouped[entityName] ?? [];
      entities.push(item);
      grouped[entityName] = entities;
      entitiesBySourceRecord.set(item.sourceRecordId, grouped);
    }
  }

  const quarantineBySourceRecord = new Map(
    result.quarantine.map((entry) => [entry.sourceRecordId, entry])
  );
  return result.sourceRows.map((sourceRow) => {
    const quarantined = quarantineBySourceRecord.get(sourceRow.id);
    const entities = entitiesBySourceRecord.get(sourceRow.id) ?? {};
    return {
      id: sourceRow.id,
      sourceSheet: sourceRow.sourceSheet,
      sourceRowNumber: sourceRow.sourceRowNumber,
      sourceRecordId: sourceRow.sourceId,
      resolution: quarantined ? 'quarantined' : 'pending_review',
      resolutionReason: quarantined ? quarantined.reasonCodes.join(',') : 'AWAITING_REVIEW',
      normalizedFingerprint: buildFingerprint(entities),
      rawPayload: sourceRow.rawPayload,
      normalizedPayload: quarantined
          ? null
          : {
            schemaVersion: result.configVersion,
            configSha256: result.configSha256,
            entities
          },
      validationErrors: quarantined ? quarantined.reasonCodes : []
    };
  });
}

function buildFingerprint(entities) {
  const contact = entities.contacts?.[0];
  const interaction = entities.interactions?.[0];
  const campaign = entities.campaign_messages?.[0];
  const parts = [
    contact?.emailNormalized,
    contact?.phoneNormalized,
    contact?.nameNormalized,
    interaction?.emailNormalized,
    interaction?.phoneNormalized,
    campaign?.recipientNormalized
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}
