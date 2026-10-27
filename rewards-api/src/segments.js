const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

export const SEGMENTS = Object.freeze(['VIP', 'PREFERENTE', 'GENERAL']);

export function classifySegment(zone, sourceEvent = '') {
  const normalizedZone = normalize(zone);
  const normalizedEvent = normalize(sourceEvent);

  // "Lateral Preferente" pertenece a General; debe evaluarse antes que
  // cualquier alias de Preferente.
  if (normalizedZone.includes('LATERAL PREFERENTE')) return 'GENERAL';
  if (/(^| )VIP( |$)/.test(normalizedZone)) return 'VIP';
  if (
    normalizedZone.includes('PREMIER')
    || normalizedZone.includes('PREMIERE')
    || normalizedZone.includes('PLANTA BAJA')
    || normalizedZone.includes('BUTACA PREFERENTE')
  ) return 'PREFERENTE';
  if (normalizedZone.includes('PLANTA ALTA') || normalizedZone.startsWith('LATERAL')) return 'GENERAL';

  // Los productos segmentados sirven como respaldo para localidades no
  // previstas; el producto general inicial se clasifica siempre por zona.
  if (normalizedEvent.includes('ABONO VIP')) return 'VIP';
  if (normalizedEvent.includes('ABONO PREFERENTE')) return 'PREFERENTE';
  if (normalizedEvent.includes('ABONO GENERAL')) return 'GENERAL';
  return null;
}

export function parseSegments(value) {
  const requested = String(value || '')
    .split(',')
    .map(normalize)
    .filter(Boolean);
  return [...new Set(requested.filter((segment) => SEGMENTS.includes(segment)))];
}

export { normalize as normalizeSegmentText };
