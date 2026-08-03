import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import EncuestaLargaCsvDownloadPage from './EncuestaLargaCsvDownloadPage'

describe('EncuestaLargaCsvDownloadPage', () => {
  let anchorClickSpy

  beforeEach(() => {
    vi.stubEnv(
      'VITE_ENCUESTA_LARGA_EXPORT_ENDPOINT',
      'https://api.example.com/api/submissions.csv'
    )
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:encuesta-larga'),
      revokeObjectURL: vi.fn()
    })
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('identifica claramente la base larga y mantiene la clave protegida', () => {
    render(<EncuestaLargaCsvDownloadPage />)

    expect(screen.getByRole('heading', { name: 'Encuesta larga' })).toBeInTheDocument()
    expect(screen.getByText(/formulario completo de experiencia/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Clave de descarga')).toHaveAttribute('type', 'password')
    expect(screen.getByText(/CSV_EXPORT_TOKEN/)).toBeInTheDocument()
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow, noarchive'
    )
  })

  it('descarga desde el endpoint largo, no desde el registro corto', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        'nombre,email,myCashlessId,calificacionExperiencia\nAna,a@example.com,123,10\n',
        { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<EncuestaLargaCsvDownloadPage />)

    fireEvent.change(screen.getByLabelText('Clave de descarga'), {
      target: { value: 'token-privado' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Descargar encuesta larga CSV' }))

    expect(await screen.findByText(/Descarga completada:/)).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/api/submissions.csv')
    expect(fetchMock.mock.calls[0][0]).not.toContain('leads-submissions.csv')
    expect(anchorClickSpy).toHaveBeenCalledOnce()
  })
})
