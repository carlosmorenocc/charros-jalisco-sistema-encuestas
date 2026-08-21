const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

export function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return text.length > 0 ? text : null;
}

export function normalizeKey(value) {
  const text = cleanText(value);
  if (!text) return null;
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('es-MX')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

export function normalizeHeader(value) {
  return normalizeKey(value);
}

export function normalizeName(value) {
  return normalizeKey(value);
}

export function normalizeEmail(value) {
  const raw = cleanText(value);
  if (!raw) return { raw: null, normalized: null, valid: null };
  const normalized = raw.replace(/\s+/gu, '').toLocaleLowerCase('en-US');
  return { raw, normalized, valid: EMAIL_PATTERN.test(normalized) };
}

export function normalizePhone(value) {
  const raw = cleanText(value);
  if (!raw) return { raw: null, normalized: null, valid: null };
  let digits = raw.replace(/\D+/gu, '');
  if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2);
  if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3);
  return {
    raw,
    normalized: digits.length > 0 ? digits : null,
    valid: digits.length === 10
  };
}

export function normalizeConsent(value) {
  const key = normalizeKey(value);
  if (!key) return null;
  if (['si', 'acepto', 'aceptado', 'autorizo', 'true', '1'].includes(key)) return 'yes';
  if (['no', 'rechazado', 'no acepto', 'false', '0'].includes(key)) return 'no';
  return 'unknown';
}

export function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // Excel usa 1899-12-30 como origen práctico para seriales modernos.
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + value * 86_400_000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const text = cleanText(value);
  if (!text) return null;
  const mexicanDate = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/u.exec(text);
  if (mexicanDate) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = mexicanDate;
    const date = new Date(Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ));
    if (
      date.getUTCFullYear() === Number(year)
      && date.getUTCMonth() === Number(month) - 1
      && date.getUTCDate() === Number(day)
    ) return date.toISOString();
    return null;
  }
  const isoLike = /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/u;
  if (!isoLike.test(text)) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number'
    ? value
    : Number(String(value).replace(/[^0-9-]/gu, ''));
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

export function normalizeDecimal(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value)
    .trim()
    .replace(/[$\s]/gu, '')
    .replace(/,(?=\d{3}(?:\D|$))/gu, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSeasonCode(value) {
  const sourceValue = cleanText(value);
  if (!sourceValue) {
    return {
      code: null,
      sourceValue: null,
      resolution: 'requires_review',
      issueCode: 'MISSING_SEASON_CODE',
      correctionCode: null
    };
  }
  const key = normalizeKey(sourceValue);
  const match = /^lmp\s+(2026|26)\s+(2027|27)$/u.exec(key ?? '');
  if (match) {
    return {
      code: 'LMP-2026-27',
      sourceValue,
      resolution: 'normalized',
      issueCode: null,
      correctionCode: sourceValue === 'LMP-2026-27'
        ? null
        : 'SEASON_VARIANT_TO_LMP-2026-27'
    };
  }
  return {
    code: null,
    sourceValue,
    resolution: 'requires_review',
    issueCode: 'UNKNOWN_SEASON_CODE',
    correctionCode: null
  };
}

export function applyControlledCorrection({ value, sheetName, field, spec }) {
  if (field !== 'antiquity' || sheetName !== 'Fuente Encuesta Larga') {
    return { value: cleanText(value), correction: null };
  }
  const correctionSpec = spec.controlledCorrections?.antiquity;
  if (!correctionSpec || value === null || value === undefined || value === '') {
    return { value: cleanText(value), correction: null };
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const localPair = [value.getDate(), value.getMonth() + 1];
    const utcPair = [value.getUTCDate(), value.getUTCMonth() + 1];
    for (const [replacement, pair] of Object.entries(correctionSpec.excelDateDayMonth ?? {})) {
      if (samePair(localPair, pair) || samePair(utcPair, pair)) {
        return {
          value: replacement,
          correction: `LONG_SURVEY_ANTIQUITY_EXCEL_DATE_TO_${replacement}`
        };
      }
    }
  }

  const normalized = normalizeKey(value)?.replace(/\s+/gu, '-') ?? null;
  for (const [replacement, aliases] of Object.entries(correctionSpec.stringAliases ?? {})) {
    const normalizedAliases = aliases.map((alias) => normalizeKey(alias)?.replace(/\s+/gu, '-'));
    if (normalized && normalizedAliases.includes(normalized)) {
      return {
        value: replacement,
        correction: `LONG_SURVEY_ANTIQUITY_TEXT_TO_${replacement}`
      };
    }
  }

  return { value: cleanText(value), correction: null };
}

export function isMeaningful(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function samePair(left, right) {
  return Array.isArray(right) && left[0] === right[0] && left[1] === right[1];
}
