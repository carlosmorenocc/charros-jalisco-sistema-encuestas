import {
  ArjonaSubmissionError,
  resolveArjonaSubmissionEndpoint,
  submitArjonaForm
} from './submitArjonaForm'

describe('submitArjonaForm', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('envía la participación al endpoint exclusivo de Ricardo Arjona', async () => {
    vi.stubEnv(
      'VITE_ARJONA_SUBMISSION_ENDPOINT',
      'https://api.example.com/api/ricardo-arjona-submit'
    )
    const payload = {
      nombreCompleto: 'ANA LÓPEZ PÉREZ',
      eventoSeleccionado: 'ricardo-arjona-pase-doble-2026-11-16',
      recomendacion: 'Más experiencias para los abonados.',
      aceptaAvisoPrivacidad: true,
      aceptaComunicaciones: false
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ ok: true, stored: true })
    })

    await expect(submitArjonaForm(payload)).resolves.toEqual({ ok: true, stored: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/ricardo-arjona-submit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    )
  })

  it('deriva el endpoint independiente desde el endpoint principal', () => {
    vi.stubEnv('VITE_ARJONA_SUBMISSION_ENDPOINT', '')
    vi.stubEnv('VITE_SUBMISSION_ENDPOINT', 'https://api.example.com/api/submit')

    expect(resolveArjonaSubmissionEndpoint()).toBe(
      'https://api.example.com/api/ricardo-arjona-submit'
    )
  })

  it('conserva el status del backend cuando el registro ya cerró', async () => {
    vi.stubEnv(
      'VITE_ARJONA_SUBMISSION_ENDPOINT',
      'https://api.example.com/api/ricardo-arjona-submit'
    )
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 410,
      text: async () => JSON.stringify({ detail: 'La convocatoria ya cerró.' })
    })

    await expect(submitArjonaForm({ nombreCompleto: 'ANA LÓPEZ PÉREZ' }))
      .rejects.toEqual(expect.objectContaining({
        name: 'ArjonaSubmissionError',
        status: 410,
        message: 'La convocatoria ya cerró.'
      }))
    expect(ArjonaSubmissionError).toBeTypeOf('function')
  })
})
