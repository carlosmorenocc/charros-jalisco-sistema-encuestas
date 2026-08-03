import {
  createEncuestaLargaCsvFilename,
  downloadEncuestaLargaCsv,
  resolveEncuestaLargaCsvEndpoint
} from './downloadEncuestaLargaCsv'

describe('resolveEncuestaLargaCsvEndpoint', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prioriza el endpoint explícito de la encuesta larga', () => {
    vi.stubEnv(
      'VITE_ENCUESTA_LARGA_EXPORT_ENDPOINT',
      'https://api.example.com/api/submissions.csv'
    )
    vi.stubEnv('VITE_SUBMISSION_ENDPOINT', 'https://otra-api.example.com/api/submit')

    expect(resolveEncuestaLargaCsvEndpoint()).toBe(
      'https://api.example.com/api/submissions.csv'
    )
  })

  it('deriva la exportación desde el endpoint principal', () => {
    vi.stubEnv('VITE_ENCUESTA_LARGA_EXPORT_ENDPOINT', '')
    vi.stubEnv('VITE_SUBMISSION_ENDPOINT', 'https://api.example.com/api/submit')

    expect(resolveEncuestaLargaCsvEndpoint()).toBe(
      'https://api.example.com/api/submissions.csv'
    )
  })
})

describe('downloadEncuestaLargaCsv', () => {
  const endpoint = 'https://api.example.com/api/submissions.csv'

  it('descarga únicamente el esquema largo con nombre diferenciado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        'nombre,email,myCashlessId,calificacionExperiencia\nAna,a@example.com,123,10\n',
        { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8' } }
      )
    )
    const link = { click: vi.fn(), remove: vi.fn() }
    const documentRef = {
      createElement: vi.fn().mockReturnValue(link),
      body: { appendChild: vi.fn() }
    }
    const urlApi = {
      createObjectURL: vi.fn().mockReturnValue('blob:encuesta-larga'),
      revokeObjectURL: vi.fn()
    }
    const scheduleTask = vi.fn()

    const filename = await downloadEncuestaLargaCsv({
      token: 'secreto-largo',
      endpoint,
      fetchImpl,
      documentRef,
      urlApi,
      scheduleTask,
      now: new Date('2026-08-02T18:30:00.000Z')
    })

    expect(fetchImpl.mock.calls[0][0]).toBe(endpoint)
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer secreto-largo')
    expect(filename).toBe('encuesta-larga-charros-2026-08-02.csv')
    expect(link.download).toBe(filename)
    expect(link.click).toHaveBeenCalledOnce()
  })

  it('rechaza el esquema del registro corto aunque sea un CSV válido', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        'nombre,email,frecuenciaVisita,aceptaRegistroDiario\nAna,a@example.com,Primera vez,true\n',
        { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8' } }
      )
    )

    await expect(
      downloadEncuestaLargaCsv({ token: 'secreto', endpoint, fetchImpl })
    ).rejects.toMatchObject({ code: 'invalid-schema' })
  })
})

describe('createEncuestaLargaCsvFilename', () => {
  it('usa la fecha de Ciudad de México', () => {
    expect(createEncuestaLargaCsvFilename(new Date('2026-08-02T04:30:00.000Z'))).toBe(
      'encuesta-larga-charros-2026-08-01.csv'
    )
  })
})
