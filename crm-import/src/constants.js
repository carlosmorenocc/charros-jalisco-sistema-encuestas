export const IMPORTER_NAME = '@charros/crm-staging-import';
export const IMPORTER_VERSION = '0.1.0';
export const STAGING_SCHEMA = 'crm_stage';
export const DEFAULT_MAX_INPUT_BYTES = 50 * 1024 * 1024;
export const DEFAULT_REPORT_DIRECTORY = 'reports';
export const WRITE_CONFIRMATION_ENV = 'CRM_IMPORT_ALLOW_WRITE';
export const TARGET_ENVIRONMENT_ENV = 'CRM_IMPORT_ENVIRONMENT';

export const ENTITY_COLLECTIONS = Object.freeze({
  sourceRows: 'source_rows',
  contacts: 'contacts',
  aliases: 'contact_aliases',
  consentEvents: 'consent_events',
  memberships: 'memberships',
  membershipUnits: 'membership_units',
  interactions: 'interactions',
  sales: 'sales',
  saleItems: 'sale_items',
  payments: 'payments',
  catalogItems: 'catalog_items',
  campaigns: 'campaigns',
  campaignMessages: 'campaign_messages',
  rewardDefinitions: 'reward_definitions',
  rawSaleSourceRows: 'raw_sale_source_rows',
  mergeCandidates: 'merge_candidates',
  quarantine: 'quarantine_rows'
});
