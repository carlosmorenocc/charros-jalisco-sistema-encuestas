import {
  createRegistrosCsvFilename,
  downloadRegistrosCsv,
  RegistrosCsvDownloadError,
  resolveRegistrosCsvEndpoint
} from './downloadRegistrosCsv'

function readBlobAsArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(reader.result))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsArrayBuffer(blob)
  })
}

describe('resolveRegistrosCsvEndpoint', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prioriza el endpoint de exportación configurado', () => {
    vi.stubEnv(
      'VITE_REGISTRO_CORTO_EXPORT_ENDPOINT',
      'https://api.example.com/api/leads-submissions.csv'
    )
    vi.stubEnv('VITE_SUBMISSION_ENDPOINT', 'https://otra-api.example.com/api/submit')

    expect(resolveRegistrosCsvEndpoint()).toBe(
      'https://api.example.com/api/leads-submissions.csv'
    )
  })

  it('deriva la descarga desde el endpoint de captura del registro corto', () => {
    vi.stubEnv('VITE_REGISTRO_CORTO_EXPORT_ENDPOINT', '')
    vi.stubEnv('VITE_LEADS_SUBMISSION_ENDPOINT', 'https://api.example.com/api/lead-submit')

    expect(resolveRegistrosCsvEndpoint()).toBe(
      'https://api.example.com/api/leads-submissions.csv'
    )
  })

  it('deriva la descarga desde el endpoint de captura principal como respaldo', () => {
    vi.stubEnv('VITE_REGISTRO_CORTO_EXPORT_ENDPOINT', '')
    vi.stubEnv('VITE_LEADS_SUBMISSION_ENDPOINT', '')
    vi.stubEnv('VITE_SUBMISSION_ENDPOINT', 'https://api.example.com/api/submit')

    expect(resolveRegistrosCsvEndpoint()).toBe(
      'https://api.example.com/api/leads-submissions.csv'
    )
  })
})

describe('downloadRegistrosCsv', () => {
  const endpoint = 'https://api.example.com/api/leads-submissions.csv'

  it('envía el token solo en Authorization y descarga el CSV con fecha', async () => {
    const csvText = (
      'nombre,email,frecuenciaVisita,aceptaRegistroDiario\n' +
      'Ana,ana@example.com,Primera vez,true\n'
    )
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
      createObjectURL: vi.fn().mockReturnValue('blob:registros-csv'),
      revokeObjectURL: vi.fn()
    }
    const scheduleTask = vi.fn()

    const filename = await downloadRegistrosCsv({
      token: '  token-super-secreto  ',
      endpoint,
      fetchImpl,
      documentRef,
      urlApi,
      scheduleTask,
      now: new Date('2026-08-02T18:30:00.000Z')
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
    expect(filename).toBe('registros-cortos-oficiales-charros-2026-08-02.csv')
    expect(link.download).toBe(filename)
    expect(link.click).toHaveBeenCalledOnce()
    expect(link.remove).toHaveBeenCalledOnce()
    expect(urlApi.createObjectURL).toHaveBeenCalledOnce()
    const downloadedBlob = urlApi.createObjectURL.mock.calls[0][0]
    expect(downloadedBlob.type).toBe('text/csv;charset=utf-8')
    const downloadedBytes = new Uint8Array(await readBlobAsArrayBuffer(downloadedBlob))
    expect([...downloadedBytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(scheduleTask).toHaveBeenCalledOnce()
    scheduleTask.mock.calls[0][0]()
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:registros-csv')
  })

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [503, 'unavailable'],
    [500, 'http-error']
  ])('maneja una respuesta HTTP %s sin crear una descarga', async (status, code) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"error":"export"}', {
        status,
        headers: { 'Content-Type': 'application/json' }
      })
    )
    const urlApi = { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() }

    await expect(
      downloadRegistrosCsv({ token: 'incorrecto', endpoint, fetchImpl, urlApi })
    ).rejects.toMatchObject({
      name: 'ProtectedCsvDownloadError',
      code,
      status
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
      downloadRegistrosCsv({ token: 'secreto', endpoint, fetchImpl })
    ).rejects.toMatchObject({ code: 'invalid-response' })
  })

  it('rechaza un CSV de la encuesta larga aunque responda como text/csv', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('nombre,email,myCashlessId,calificacionExperiencia\nAna,a@example.com,1,10\n', {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8' }
      })
    )

    await expect(
      downloadRegistrosCsv({ token: 'secreto', endpoint, fetchImpl })
    ).rejects.toMatchObject({ code: 'invalid-schema' })
  })

  it('no acepta solicitudes sin token o sin endpoint configurado', async () => {
    const fetchImpl = vi.fn()

    await expect(
      downloadRegistrosCsv({ token: '   ', endpoint, fetchImpl })
    ).rejects.toMatchObject({ code: 'missing-token' })
    await expect(
      downloadRegistrosCsv({ token: 'secreto', endpoint: '', fetchImpl })
    ).rejects.toMatchObject({ code: 'configuration' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('identifica errores de red', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network'))

    await expect(
      downloadRegistrosCsv({ token: 'secreto', endpoint, fetchImpl })
    ).rejects.toBeInstanceOf(RegistrosCsvDownloadError)
    await expect(
      downloadRegistrosCsv({ token: 'secreto', endpoint, fetchImpl })
    ).rejects.toMatchObject({ code: 'network' })
  })
})

describe('createRegistrosCsvFilename', () => {
  it('usa la fecha local de México aunque UTC ya esté en el día siguiente', () => {
    expect(createRegistrosCsvFilename(new Date('2026-08-02T04:30:00.000Z'))).toBe(
      'registros-cortos-oficiales-charros-2026-08-01.csv'
    )
  })
})
