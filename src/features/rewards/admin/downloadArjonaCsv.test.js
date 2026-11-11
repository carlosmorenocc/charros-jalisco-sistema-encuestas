import {
  ArjonaCsvDownloadError,
  createArjonaCsvFilename,
  downloadArjonaCsv,
  resolveArjonaCsvEndpoint
} from './downloadArjonaCsv'

const ARJONA_COLUMNS = [
  'submissionId',
  'timestamp',
  'campaignName',
  'source',
  'nombreCompleto',
  'eventoSeleccionado',
  'recomendacion',
  'aceptaAvisoPrivacidad',
  'aceptaComunicaciones',
  'privacyNoticeVersion',
  'consentTimestamp'
]

describe('resolveArjonaCsvEndpoint', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('prioriza el endpoint de exportación independiente', () => {
    vi.stubEnv(
      'VITE_ARJONA_EXPORT_ENDPOINT',
      'https://api.example.com/api/ricardo-arjona-submissions.csv'
    )
    vi.stubEnv(
      'VITE_ARJONA_SUBMISSION_ENDPOINT',
      'https://otra-api.example.com/api/ricardo-arjona-submit'
    )

    expect(resolveArjonaCsvEndpoint()).toBe(
      'https://api.example.com/api/ricardo-arjona-submissions.csv'
    )
  })

  it('deriva la exportación desde el endpoint de captura', () => {
    vi.stubEnv('VITE_ARJONA_EXPORT_ENDPOINT', '')
    vi.stubEnv(
      'VITE_ARJONA_SUBMISSION_ENDPOINT',
      'https://api.example.com/api/ricardo-arjona-submit'
    )

    expect(resolveArjonaCsvEndpoint()).toBe(
      'https://api.example.com/api/ricardo-arjona-submissions.csv'
    )
  })

  it('deriva la exportación desde el endpoint principal como respaldo', () => {
    vi.stubEnv('VITE_ARJONA_EXPORT_ENDPOINT', '')
    vi.stubEnv('VITE_ARJONA_SUBMISSION_ENDPOINT', '')
    vi.stubEnv('VITE_SUBMISSION_ENDPOINT', 'https://api.example.com/api/submit')

    expect(resolveArjonaCsvEndpoint()).toBe(
      'https://api.example.com/api/ricardo-arjona-submissions.csv'
    )
  })
})

describe('downloadArjonaCsv', () => {
  const endpoint = 'https://api.example.com/api/ricardo-arjona-submissions.csv'

  it('descarga exclusivamente el esquema de Ricardo Arjona con nombre fechado', async () => {
    const csvText = `${ARJONA_COLUMNS.join(',')}\nsubmission-1,2026-11-11T15:00:00.000Z,Club Charros,ricardo-arjona-2026,ANA PÉREZ,ricardo-arjona-2026-11-16,Más dinámicas,true,false,2026-11-11,2026-11-11T15:00:00.000Z\n`
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(csvText, {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8' }
      })
    )
    const link = {
      href: '',
      download: '',
      rel: '',
      hidden: false,
      click: vi.fn(),
      remove: vi.fn()
    }
    const documentRef = {
      createElement: vi.fn().mockReturnValue(link),
      body: { appendChild: vi.fn() }
    }
    const urlApi = {
      createObjectURL: vi.fn().mockReturnValue('blob:arjona-csv'),
      revokeObjectURL: vi.fn()
    }

    const filename = await downloadArjonaCsv({
      token: ' token-super-secreto ',
      endpoint,
      fetchImpl,
      documentRef,
      urlApi,
      scheduleTask: vi.fn(),
      now: new Date('2026-11-11T18:30:00.000Z')
    })

    expect(fetchImpl).toHaveBeenCalledWith(endpoint, expect.objectContaining({
      method: 'GET',
      headers: {
        Accept: 'text/csv',
        Authorization: 'Bearer token-super-secreto'
      },
      cache: 'no-store',
      credentials: 'omit'
    }))
    expect(filename).toBe(
      'club-charros-ricardo-arjona-pase-doble-2026-11-16-2026-11-11.csv'
    )
    expect(link.download).toBe(filename)
    expect(link.click).toHaveBeenCalledOnce()
  })

  it('rechaza las bases históricas de otras experiencias', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        'nombreCompleto,eventosSeleccionados,participaPapaSobreRuedas,participaRomeoSantos,recomendacion,aceptaAvisoPrivacidad\nANA,romeo,false,true,,true\n',
        { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8' } }
      )
    )

    await expect(
      downloadArjonaCsv({ token: 'secreto', endpoint, fetchImpl })
    ).rejects.toMatchObject({ code: 'invalid-schema' })
  })

  it('no intenta descargar sin token o sin endpoint configurado', async () => {
    const fetchImpl = vi.fn()

    await expect(
      downloadArjonaCsv({ token: '  ', endpoint, fetchImpl })
    ).rejects.toBeInstanceOf(ArjonaCsvDownloadError)
    await expect(
      downloadArjonaCsv({ token: 'secreto', endpoint: '', fetchImpl })
    ).rejects.toMatchObject({ code: 'configuration' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('createArjonaCsvFilename', () => {
  it('usa la fecha local de México y distingue el evento', () => {
    expect(createArjonaCsvFilename(new Date('2026-11-11T04:30:00.000Z'))).toBe(
      'club-charros-ricardo-arjona-pase-doble-2026-11-16-2026-11-10.csv'
    )
  })
})
