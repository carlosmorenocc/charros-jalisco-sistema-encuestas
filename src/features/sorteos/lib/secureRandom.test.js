import { secureRandomIndex } from './secureRandom'

function sequenceCrypto(values) {
  let index = 0
  return {
    getRandomValues(target) {
      target[0] = values[index]
      index += 1
      return target
    }
  }
}

describe('secureRandomIndex', () => {
  it('devuelve un índice dentro del padrón', () => {
    expect(secureRandomIndex(500, sequenceCrypto([123456]))).toBe(456)
  })

  it('rechaza valores fuera del límite para evitar sesgo por módulo', () => {
    const count = 3000
    const range = 0x100000000
    const limit = Math.floor(range / count) * count
    const cryptoProvider = sequenceCrypto([limit, limit - 1])

    expect(secureRandomIndex(count, cryptoProvider)).toBe((limit - 1) % count)
  })

  it('no utiliza Math.random', () => {
    const randomSpy = vi.spyOn(Math, 'random')

    secureRandomIndex(10, sequenceCrypto([9]))

    expect(randomSpy).not.toHaveBeenCalled()
    randomSpy.mockRestore()
  })

  it('rechaza conteos inválidos', () => {
    expect(() => secureRandomIndex(0, sequenceCrypto([0]))).toThrow(RangeError)
  })
})
