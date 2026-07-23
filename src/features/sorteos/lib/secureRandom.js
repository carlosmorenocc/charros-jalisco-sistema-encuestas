const UINT32_RANGE = 0x100000000

export function secureRandomIndex(count, cryptoProvider = globalThis.crypto) {
  if (!Number.isSafeInteger(count) || count < 1 || count > UINT32_RANGE) {
    throw new RangeError('El número de participantes elegibles debe ser un entero positivo.')
  }

  if (!cryptoProvider || typeof cryptoProvider.getRandomValues !== 'function') {
    throw new Error('Este navegador no ofrece generación aleatoria segura.')
  }

  const sample = new Uint32Array(1)
  const limit = Math.floor(UINT32_RANGE / count) * count
  let value

  do {
    cryptoProvider.getRandomValues(sample)
    value = sample[0]
  } while (value >= limit)

  return value % count
}
