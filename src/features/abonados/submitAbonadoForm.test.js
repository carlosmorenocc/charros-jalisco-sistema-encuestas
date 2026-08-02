import { submitAbonadoForm } from './submitAbonadoForm'

describe('submitAbonadoForm', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('envía JSON al endpoint exclusivo de abonados', async () => {
    vi.stubEnv('VITE_ABONADOS_SUBMISSION_ENDPOINT', 'https://api.example.com/api/abonados-lmp-submit')
    const payload = {
      nombre: 'María',
      apellido: 'López',
      email: 'maria@example.com',
      telefono: '3331234567',
      cantidadAbonos: 2,
      tallasJersey: ['M', 'XL'],
      aceptaAvisoPrivacidad: true,
      aceptaComunicaciones: false
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ ok: true, stored: true })
    })
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')

    await expect(submitAbonadoForm(payload)).resolves.toEqual({ ok: true, stored: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/abonados-lmp-submit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    )
    expect(storageSpy).not.toHaveBeenCalled()
  })

  it('propaga el fallo remoto y nunca guarda PII en localStorage', async () => {
    vi.stubEnv('VITE_ABONADOS_SUBMISSION_ENDPOINT', 'https://api.example.com/api/abonados-lmp-submit')
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'))

    await expect(submitAbonadoForm({ email: 'maria@example.com' }))
      .rejects.toThrow('network unavailable')
    expect(storageSpy).not.toHaveBeenCalled()
  })

  it('conserva el status del backend para manejar duplicados', async () => {
    vi.stubEnv('VITE_ABONADOS_SUBMISSION_ENDPOINT', 'https://api.example.com/api/abonados-lmp-submit')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ error: 'Duplicate subscriber email' })
    })

    await expect(submitAbonadoForm({ email: 'maria@example.com' }))
      .rejects.toMatchObject({ status: 409, message: 'Duplicate subscriber email' })
  })
})
