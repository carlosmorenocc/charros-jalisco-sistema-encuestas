import { getJerseyOrdinal, getJerseySizeQuestion, MAX_ABONOS } from './jerseyOrdinals'

describe('ordinales de jerseys', () => {
  it('define los ordinales profesionales de las 25 posiciones', () => {
    expect(Array.from({ length: MAX_ABONOS }, (_, index) => getJerseyOrdinal(index + 1))).toEqual([
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
  })

  it('construye una pregunta completa y rechaza posiciones fuera del rango', () => {
    expect(getJerseySizeQuestion(1)).toBe('¿Cuál es la talla de tu primer jersey?')
    expect(getJerseySizeQuestion(25)).toBe('¿Cuál es la talla de tu vigésimo quinto jersey?')
    expect(() => getJerseySizeQuestion(0)).toThrow(RangeError)
    expect(() => getJerseySizeQuestion(26)).toThrow(RangeError)
    expect(() => getJerseySizeQuestion(1.5)).toThrow(RangeError)
  })
})
