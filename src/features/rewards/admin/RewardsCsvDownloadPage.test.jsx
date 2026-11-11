import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import RewardsCsvDownloadPage from './RewardsCsvDownloadPage'

const HISTORICAL_CSV =
  'nombreCompleto,eventosSeleccionados,participaPapaSobreRuedas,participaRomeoSantos,recomendacion,aceptaAvisoPrivacidad\n' +
  'ANA PÉREZ,romeo-santos,false,true,,true\n'

const SOFTBALL_CSV =
  'submissionId,folioRegistro,participanteId,modalidadRegistro,timestamp,campaignName,source,nombreCompleto,telefono,cantidadAbonos,eventoSeleccionado,aceptaAvisoPrivacidad,aceptaComunicaciones,privacyNoticeVersion,consentTimestamp\n' +
  'submission-1,000001,000001.1,MULTIPARTICIPANTE,2026-11-02T15:00:00.000Z,Club Charros,softbol-afiliados-2026,ANA PÉREZ,3312345678,2,softbol-club-charros-2026-11-08,true,false,2026-11-02,2026-11-02T15:00:00.000Z\n'

const ARJONA_CSV =
  'submissionId,timestamp,campaignName,source,nombreCompleto,eventoSeleccionado,recomendacion,aceptaAvisoPrivacidad,aceptaComunicaciones,privacyNoticeVersion,consentTimestamp\n' +
  'submission-2,2026-11-11T15:00:00.000Z,Club Charros,ricardo-arjona-2026,ANA PÉREZ,ricardo-arjona-pase-doble-2026-11-16,Más experiencias,true,false,2026-11-11,2026-11-11T15:00:00.000Z\n'

describe('RewardsCsvDownloadPage', () => {
  let anchorClickSpy

  beforeEach(() => {
    vi.stubEnv(
      'VITE_REWARDS_EXPORT_ENDPOINT',
      'https://api.example.com/api/rewards-submissions.csv'
    )
    vi.stubEnv(
      'VITE_SOFTBALL_EXPORT_ENDPOINT',
      'https://api.example.com/api/softball-submissions.csv'
    )
    vi.stubEnv(
      'VITE_ARJONA_EXPORT_ENDPOINT',
      'https://api.example.com/api/ricardo-arjona-submissions.csv'
    )
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:admin-csv'),
      revokeObjectURL: vi.fn()
    })
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('presenta el histórico y cada evento como bases administrativas separadas', () => {
    render(<RewardsCsvDownloadPage />)

    expect(screen.getByRole('heading', { name: 'Bases de participaciones' })).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Papá sobre Ruedas y Romeo Santos' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Partido de sóftbol para afiliados' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Ricardo Arjona · 16 de noviembre de 2026' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar histórico CSV' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar sóftbol CSV' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar Ricardo Arjona CSV' })).toBeInTheDocument()
    expect(screen.getAllByText(/CSV_EXPORT_TOKEN/)).toHaveLength(3)
    expect(screen.getAllByLabelText(/Clave de descarga para/)).toHaveLength(3)
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow, noarchive'
    )
  })

  it('descarga cada base desde su endpoint sin mezclar los archivos', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(HISTORICAL_CSV, {
          status: 200,
          headers: { 'Content-Type': 'text/csv; charset=utf-8' }
        })
      )
      .mockResolvedValueOnce(
        new Response(SOFTBALL_CSV, {
          status: 200,
          headers: { 'Content-Type': 'text/csv; charset=utf-8' }
        })
      )
      .mockResolvedValueOnce(
        new Response(ARJONA_CSV, {
          status: 200,
          headers: { 'Content-Type': 'text/csv; charset=utf-8' }
        })
      )
    vi.stubGlobal('fetch', fetchMock)
    render(<RewardsCsvDownloadPage />)

    const historicalSection = screen.getByRole('region', {
      name: 'Papá sobre Ruedas y Romeo Santos'
    })
    const historicalToken = within(historicalSection).getByLabelText(/Clave de descarga/)
    fireEvent.change(historicalToken, { target: { value: 'token-historico' } })
    fireEvent.click(within(historicalSection).getByRole('button', { name: 'Descargar histórico CSV' }))

    expect(await within(historicalSection).findByText(/Descarga completada:/)).toHaveTextContent(
      /club-charros-experiencias-recompensas-\d{4}-\d{2}-\d{2}\.csv/
    )
    expect(historicalToken).toHaveValue('')
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.example.com/api/rewards-submissions.csv'
    )
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token-historico')

    const softballSection = screen.getByRole('region', {
      name: 'Partido de sóftbol para afiliados'
    })
    const softballToken = within(softballSection).getByLabelText(/Clave de descarga/)
    fireEvent.change(softballToken, { target: { value: 'token-softbol' } })
    fireEvent.click(within(softballSection).getByRole('button', { name: 'Descargar sóftbol CSV' }))

    expect(await within(softballSection).findByText(/Descarga completada:/)).toHaveTextContent(
      /club-charros-softbol-afiliados-2026-11-08-\d{4}-\d{2}-\d{2}\.csv/
    )
    expect(softballToken).toHaveValue('')
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.example.com/api/softball-submissions.csv'
    )
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer token-softbol')

    const arjonaSection = screen.getByRole('region', {
      name: 'Ricardo Arjona · 16 de noviembre de 2026'
    })
    const arjonaToken = within(arjonaSection).getByLabelText(/Clave de descarga/)
    fireEvent.change(arjonaToken, { target: { value: 'token-arjona' } })
    fireEvent.click(
      within(arjonaSection).getByRole('button', { name: 'Descargar Ricardo Arjona CSV' })
    )

    expect(await within(arjonaSection).findByText(/Descarga completada:/)).toHaveTextContent(
      /club-charros-ricardo-arjona-pase-doble-2026-11-16-\d{4}-\d{2}-\d{2}\.csv/
    )
    expect(arjonaToken).toHaveValue('')
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://api.example.com/api/ricardo-arjona-submissions.csv'
    )
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer token-arjona')
    expect(anchorClickSpy).toHaveBeenCalledTimes(3)
  })

  it('valida por separado la clave de la descarga de sóftbol', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<RewardsCsvDownloadPage />)

    const softballSection = screen.getByRole('region', {
      name: 'Partido de sóftbol para afiliados'
    })
    fireEvent.click(within(softballSection).getByRole('button', { name: 'Descargar sóftbol CSV' }))

    expect(await within(softballSection).findByRole('alert')).toHaveTextContent(
      'Ingresa la clave de descarga.'
    )
    expect(fetchMock).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(
        within(softballSection).getByRole('button', { name: 'Descargar sóftbol CSV' })
      ).toBeEnabled()
    })
  })
})
