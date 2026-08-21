import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_URL = new URL('../config/sheets.json', import.meta.url);
const SUPPORTED_ENTITIES = new Set([
  'contact',
  'membership',
  'interaction',
  'sale',
  'catalog',
  'campaign_message',
  'contact_source',
  'reward_definition',
  'raw_sale_source'
]);

export async function loadSheetConfig(customPath) {
  const path = customPath ?? fileURLToPath(DEFAULT_CONFIG_URL);
  const raw = await readFile(path, 'utf8');
  const config = JSON.parse(raw);
  validateSheetConfig(config);
  Object.defineProperty(config, 'sha256', {
    value: createHash('sha256').update(raw).digest('hex'),
    enumerable: false,
    configurable: false,
    writable: false
  });
  return config;
}

export function validateSheetConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('La configuración de hojas debe ser un objeto JSON.');
  }
  if (!nonEmptyString(config.version)) {
    throw new Error('La configuración requiere un campo version.');
  }
  if (!config.sheets || typeof config.sheets !== 'object' || Array.isArray(config.sheets)) {
    throw new Error('La configuración requiere un objeto sheets.');
  }

  for (const [sheetName, spec] of Object.entries(config.sheets)) {
    if (!nonEmptyString(sheetName) || !spec || typeof spec !== 'object') {
      throw new Error('Cada hoja configurada debe tener nombre y especificación válidos.');
    }
    if (!SUPPORTED_ENTITIES.has(spec.entity)) {
      throw new Error(`Entidad no soportada en la hoja ${sheetName}.`);
    }
    if (!spec.fields || typeof spec.fields !== 'object' || Array.isArray(spec.fields)) {
      throw new Error(`La hoja ${sheetName} requiere un objeto fields.`);
    }
    if (!Array.isArray(spec.materialFields) || spec.materialFields.length === 0) {
      throw new Error(`La hoja ${sheetName} requiere materialFields.`);
    }
    for (const [field, aliases] of Object.entries(spec.fields)) {
      if (!nonEmptyString(field) || !Array.isArray(aliases) || aliases.length === 0) {
        throw new Error(`Alias inválidos para ${sheetName}.${field}.`);
      }
    }
  }
  return config;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
