import { getJerseyOrdinal, getJerseySizeQuestion, MAX_ABONOS } from './jerseyOrdinals'

describe('ordinales de jerseys', () => {
  it('define los ordinales profesionales de las 20 posiciones', () => {
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
      'vigésimo'
    ])
  })

  it('construye una pregunta completa y rechaza posiciones fuera del rango', () => {
    expect(getJerseySizeQuestion(1)).toBe('¿Qué talla te gustaría para tu primer jersey?')
    expect(getJerseySizeQuestion(20)).toBe('¿Qué talla te gustaría para tu vigésimo jersey?')
    expect(() => getJerseySizeQuestion(0)).toThrow(RangeError)
    expect(() => getJerseySizeQuestion(21)).toThrow(RangeError)
    expect(() => getJerseySizeQuestion(1.5)).toThrow(RangeError)
  })
})
