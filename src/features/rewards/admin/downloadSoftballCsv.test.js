import {
  createSoftballCsvFilename,
  downloadSoftballCsv,
  resolveSoftballCsvEndpoint,
  SoftballCsvDownloadError
} from './downloadSoftballCsv'

const SOFTBALL_COLUMNS = [
  'submissionId',
  'timestamp',
  'campaignName',
  'source',
  'nombreCompleto',
  'telefono',
  'cantidadAbonos',
  'eventoSeleccionado',
  'aceptaAvisoPrivacidad',
  'aceptaComunicaciones',
  'privacyNoticeVersion',
  'consentTimestamp'
]

function readBlobAsArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(reader.result))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsArrayBuffer(blob)
  })
}

describe('resolveSoftballCsvEndpoint', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prioriza el endpoint de exportación independiente', () => {
    vi.stubEnv(
      'VITE_SOFTBALL_EXPORT_ENDPOINT',
      'https://api.example.com/api/softball-submissions.csv'
    )
    vi.stubEnv(
      'VITE_SOFTBALL_SUBMISSION_ENDPOINT',
      'https://otra-api.example.com/api/softball-submit'
    )

    expect(resolveSoftballCsvEndpoint()).toBe(
      'https://api.example.com/api/softball-submissions.csv'
    )
  })

  it('deriva la exportación desde el endpoint de captura de sóftbol', () => {
    vi.stubEnv('VITE_SOFTBALL_EXPORT_ENDPOINT', '')
    vi.stubEnv(
      'VITE_SOFTBALL_SUBMISSION_ENDPOINT',
      'https://api.example.com/api/softball-submit'
    )

    expect(resolveSoftballCsvEndpoint()).toBe(
      'https://api.example.com/api/softball-submissions.csv'
    )
  })

  it('deriva la exportación desde el endpoint principal como respaldo', () => {
    vi.stubEnv('VITE_SOFTBALL_EXPORT_ENDPOINT', '')
    vi.stubEnv('VITE_SOFTBALL_SUBMISSION_ENDPOINT', '')
    vi.stubEnv('VITE_SUBMISSION_ENDPOINT', 'https://api.example.com/api/submit')

    expect(resolveSoftballCsvEndpoint()).toBe(
      'https://api.example.com/api/softball-submissions.csv'
    )
  })
})

describe('downloadSoftballCsv', () => {
  const endpoint = 'https://api.example.com/api/softball-submissions.csv'

  it('descarga exclusivamente el esquema de sóftbol con nombre fechado', async () => {
    const csvText = `${SOFTBALL_COLUMNS.join(',')}\nsubmission-1,2026-11-02T15:00:00.000Z,softbol-afiliados-2026,web,ANA PÉREZ,3312345678,2,softbol-club-charros-2026-11-08,true,false,2026-11-02,2026-11-02T15:00:00.000Z\n`
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
      createObjectURL: vi.fn().mockReturnValue('blob:softball-csv'),
      revokeObjectURL: vi.fn()
    }
    const scheduleTask = vi.fn()

    const filename = await downloadSoftballCsv({
      token: '  token-super-secreto  ',
      endpoint,
      fetchImpl,
      documentRef,
      urlApi,
      scheduleTask,
      now: new Date('2026-11-02T18:30:00.000Z')
    })

    expect(fetchImpl).toHaveBeenCalledWith(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'text/csv',
        Authorization: 'Bearer token-super-secreto'
      },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    })
    expect(fetchImpl.mock.calls[0][0]).not.toContain('token-super-secreto')
    expect(filename).toBe('club-charros-softbol-afiliados-2026-11-08-2026-11-02.csv')
    expect(link.download).toBe(filename)
    expect(link.click).toHaveBeenCalledOnce()
    expect(link.remove).toHaveBeenCalledOnce()

    const downloadedBlob = urlApi.createObjectURL.mock.calls[0][0]
    expect(downloadedBlob.type).toBe('text/csv;charset=utf-8')
    const downloadedBytes = new Uint8Array(await readBlobAsArrayBuffer(downloadedBlob))
    expect([...downloadedBytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])

    expect(scheduleTask).toHaveBeenCalledOnce()
    scheduleTask.mock.calls[0][0]()
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:softball-csv')
  })

  it('rechaza el CSV histórico de Papá sobre Ruedas y Romeo Santos', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        'nombreCompleto,eventosSeleccionados,participaPapaSobreRuedas,participaRomeoSantos,recomendacion,aceptaAvisoPrivacidad\nANA,romeo,false,true,,true\n',
        {
          status: 200,
          headers: { 'Content-Type': 'text/csv; charset=utf-8' }
        }
      )
    )
    const urlApi = { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() }

    await expect(
      downloadSoftballCsv({ token: 'secreto', endpoint, fetchImpl, urlApi })
    ).rejects.toMatchObject({
      name: 'ProtectedCsvDownloadError',
      code: 'invalid-schema'
    })
    expect(urlApi.createObjectURL).not.toHaveBeenCalled()
  })

  it('rechaza un esquema incompleto de sóftbol', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('nombreCompleto,telefono,eventoSeleccionado\nANA,3312345678,softbol\n', {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8' }
      })
    )

    await expect(
      downloadSoftballCsv({ token: 'secreto', endpoint, fetchImpl })
    ).rejects.toMatchObject({ code: 'invalid-schema' })
  })

  it('no intenta descargar sin token o sin endpoint configurado', async () => {
    const fetchImpl = vi.fn()

    await expect(
      downloadSoftballCsv({ token: '   ', endpoint, fetchImpl })
    ).rejects.toBeInstanceOf(SoftballCsvDownloadError)
    await expect(
      downloadSoftballCsv({ token: 'secreto', endpoint: '', fetchImpl })
    ).rejects.toMatchObject({ code: 'configuration' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('createSoftballCsvFilename', () => {
  it('usa la fecha local de México y distingue el evento', () => {
    expect(createSoftballCsvFilename(new Date('2026-11-02T04:30:00.000Z'))).toBe(
      'club-charros-softbol-afiliados-2026-11-08-2026-11-01.csv'
    )
  })
})
