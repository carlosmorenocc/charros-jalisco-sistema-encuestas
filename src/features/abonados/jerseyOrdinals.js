export const MAX_ABONOS = 25

const JERSEY_ORDINALS = Object.freeze([
  'primer',
  'segundo',
  'tercer',
  'cuarto',
  'quinto',
  'sexto',
  'séptimo',
  'octavo',
  'noveno',
  'décimo',
  'undécimo',
  'duodécimo',
  'decimotercer',
  'decimocuarto',
  'decimoquinto',
  'decimosexto',
  'decimoséptimo',
  'decimoctavo',
  'decimonoveno',
  'vigésimo',
  'vigésimo primer',
  'vigésimo segundo',
  'vigésimo tercer',
  'vigésimo cuarto',
  'vigésimo quinto'
])

export function getJerseyOrdinal(position) {
  if (!Number.isInteger(position) || position < 1 || position > MAX_ABONOS) {
    throw new RangeError(`La posición del jersey debe estar entre 1 y ${MAX_ABONOS}.`)
  }

  return JERSEY_ORDINALS[position - 1]
}

export function getJerseySizeQuestion(position) {
  return `¿Cuál es la talla de tu ${getJerseyOrdinal(position)} jersey?`
}
