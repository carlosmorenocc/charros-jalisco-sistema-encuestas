import { submitSoftballForm } from './submitSoftballForm'

describe('submitSoftballForm', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('envía el registro al endpoint exclusivo de sóftbol', async () => {
    vi.stubEnv('VITE_SOFTBALL_SUBMISSION_ENDPOINT', 'https://api.example.com/api/softball-submit')
    const payload = {
      nombreCompleto: 'ANA LÓPEZ PÉREZ',
      telefono: '3312345678',
      eventoSeleccionado: 'softbol-club-charros-2026-11-08',
      aceptaAvisoPrivacidad: true,
      aceptaComunicaciones: false
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ ok: true, stored: true })
    })

    await expect(submitSoftballForm(payload)).resolves.toEqual({ ok: true, stored: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/softball-submit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    )
  })

  it('deriva el endpoint independiente desde el endpoint principal', async () => {
    vi.stubEnv('VITE_SOFTBALL_SUBMISSION_ENDPOINT', '')
    vi.stubEnv('VITE_SUBMISSION_ENDPOINT', 'https://api.example.com/api/submit')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ ok: true })
    })

    await submitSoftballForm({ nombreCompleto: 'ANA LÓPEZ PÉREZ' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/softball-submit',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('conserva el status y detalle del backend para registros duplicados', async () => {
    vi.stubEnv('VITE_SOFTBALL_SUBMISSION_ENDPOINT', 'https://api.example.com/api/softball-submit')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ detail: 'La persona ya está registrada' })
    })

    await expect(submitSoftballForm({ nombreCompleto: 'ANA LÓPEZ PÉREZ' }))
      .rejects.toMatchObject({ status: 409, message: 'La persona ya está registrada' })
  })
})
