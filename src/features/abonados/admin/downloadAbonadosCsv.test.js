import {
  AbonadosCsvDownloadError,
  createAbonadosCsvFilename,
  downloadAbonadosCsv,
  resolveAbonadosCsvEndpoint
} from './downloadAbonadosCsv'

function readBlobAsArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(reader.result))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsArrayBuffer(blob)
  })
}

describe('resolveAbonadosCsvEndpoint', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prioriza el endpoint de exportación configurado', () => {
    vi.stubEnv(
      'VITE_ABONADOS_EXPORT_ENDPOINT',
      'https://api.example.com/api/abonados-lmp-submissions.csv'
    )
    vi.stubEnv(
      'VITE_ABONADOS_SUBMISSION_ENDPOINT',
      'https://otra-api.example.com/api/abonados-lmp-submit'
    )

    expect(resolveAbonadosCsvEndpoint()).toBe(
      'https://api.example.com/api/abonados-lmp-submissions.csv'
    )
  })

  it('deriva la descarga desde el endpoint de captura de abonados', () => {
    vi.stubEnv('VITE_ABONADOS_EXPORT_ENDPOINT', '')
    vi.stubEnv(
      'VITE_ABONADOS_SUBMISSION_ENDPOINT',
      'https://api.example.com/api/abonados-lmp-submit'
    )

    expect(resolveAbonadosCsvEndpoint()).toBe(
      'https://api.example.com/api/abonados-lmp-submissions.csv'
    )
  })
})

describe('downloadAbonadosCsv', () => {
  const endpoint = 'https://api.example.com/api/abonados-lmp-submissions.csv'

  it('envía el token solo en Authorization y descarga el CSV con fecha', async () => {
    const csvBlob = new Blob(['nombre,email\nAna,ana@example.com\n'], { type: 'text/csv' })
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(csvBlob, {
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
      createObjectURL: vi.fn().mockReturnValue('blob:abonados-csv'),
      revokeObjectURL: vi.fn()
    }
    const scheduleTask = vi.fn()

    const filename = await downloadAbonadosCsv({
      token: '  token-super-secreto  ',
      endpoint,
      fetchImpl,
      documentRef,
      urlApi,
      scheduleTask,
      now: new Date('2026-08-01T18:30:00.000Z')
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
    expect(filename).toBe('registros-abonados-lmp-2026-2027-2026-08-01.csv')
    expect(link.download).toBe(filename)
    expect(link.click).toHaveBeenCalledOnce()
    expect(link.remove).toHaveBeenCalledOnce()
    expect(urlApi.createObjectURL).toHaveBeenCalledOnce()
    const downloadedBlob = urlApi.createObjectURL.mock.calls[0][0]
    expect(downloadedBlob.type).toBe('text/csv;charset=utf-8')
    const downloadedBytes = new Uint8Array(await readBlobAsArrayBuffer(downloadedBlob))
    expect([...downloadedBytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(scheduleTask).toHaveBeenCalledOnce()
    expect(urlApi.revokeObjectURL).not.toHaveBeenCalled()
    scheduleTask.mock.calls[0][0]()
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:abonados-csv')
  })

  it('identifica un token rechazado sin intentar crear una descarga', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"error":"Unauthorized CSV export"}', {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    )
    const urlApi = {
      createObjectURL: vi.fn(),
      revokeObjectURL: vi.fn()
    }

    await expect(
      downloadAbonadosCsv({ token: 'incorrecto', endpoint, fetchImpl, urlApi })
    ).rejects.toMatchObject({
      name: 'AbonadosCsvDownloadError',
      code: 'unauthorized',
      status: 401
    })
    expect(urlApi.createObjectURL).not.toHaveBeenCalled()
  })

  it('rechaza una respuesta exitosa que no sea CSV', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('<html>Acceso</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      })
    )

    await expect(
      downloadAbonadosCsv({ token: 'secreto', endpoint, fetchImpl })
    ).rejects.toMatchObject({ code: 'invalid-response' })
  })

  it('no acepta una solicitud sin token', async () => {
    const fetchImpl = vi.fn()

    await expect(
      downloadAbonadosCsv({ token: '   ', endpoint, fetchImpl })
    ).rejects.toBeInstanceOf(AbonadosCsvDownloadError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('createAbonadosCsvFilename', () => {
  it('usa la fecha local de México aunque UTC ya esté en el día siguiente', () => {
    expect(createAbonadosCsvFilename(new Date('2026-08-01T04:30:00.000Z'))).toBe(
      'registros-abonados-lmp-2026-2027-2026-07-31.csv'
    )
  })
})
