import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import RegistrosCsvDownloadPage from './RegistrosCsvDownloadPage'

describe('RegistrosCsvDownloadPage', () => {
  let createObjectUrlSpy
  let revokeObjectUrlSpy
  let anchorClickSpy

  beforeEach(() => {
    vi.stubEnv(
      'VITE_REGISTROS_EXPORT_ENDPOINT',
      'https://api.example.com/api/submissions.csv'
    )
    createObjectUrlSpy = vi.fn().mockReturnValue('blob:registros-csv')
    revokeObjectUrlSpy = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL: createObjectUrlSpy,
      revokeObjectURL: revokeObjectUrlSpy
    })
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('solicita CSV_EXPORT_TOKEN como contraseña y marca la ruta para no indexarse', () => {
    render(<RegistrosCsvDownloadPage />)

    expect(screen.getByRole('heading', { name: 'Registro Oficial' })).toBeInTheDocument()
    const input = screen.getByLabelText('Clave de descarga')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).not.toHaveAttribute('name')
    expect(screen.getByText(/CSV_EXPORT_TOKEN/)).toBeInTheDocument()
    expect(screen.queryByText(/ABONADOS_CSV_EXPORT_TOKEN/)).not.toBeInTheDocument()
    expect(screen.getByText(/el archivo contiene datos personales/i)).toBeInTheDocument()
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow, noarchive'
    )
  })

  it('valida la clave requerida antes de llamar al backend', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<RegistrosCsvDownloadPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Descargar Registro Oficial CSV' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ingresa la clave de descarga.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('descarga el archivo sin persistir la clave y la limpia después del éxito', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('nombre,email\nAna,ana@example.com\n', {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8' }
      })
    )
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
    vi.stubGlobal('fetch', fetchMock)
    render(<RegistrosCsvDownloadPage />)

    const input = screen.getByLabelText('Clave de descarga')
    fireEvent.change(input, { target: { value: 'token-privado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Descargar Registro Oficial CSV' }))

    expect(await screen.findByText(/Descarga completada:/)).toBeInTheDocument()
    expect(input).toHaveValue('')
    expect(fetchMock.mock.calls[0][0]).not.toContain('token-privado')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token-privado')
    expect(storageSpy).not.toHaveBeenCalled()
    expect(anchorClickSpy).toHaveBeenCalledOnce()
    expect(createObjectUrlSpy).toHaveBeenCalledOnce()
    expect(revokeObjectUrlSpy).toHaveBeenCalledOnce()
  })

  it('explica un rechazo 401 y limpia la clave sensible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"error":"Unauthorized CSV export"}', {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    )
    render(<RegistrosCsvDownloadPage />)

    const input = screen.getByLabelText('Clave de descarga')
    fireEvent.change(input, { target: { value: 'token-incorrecto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Descargar Registro Oficial CSV' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La clave no es válida.')
    expect(input).toHaveValue('')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Descargar Registro Oficial CSV' })).toBeEnabled()
    })
  })
})
