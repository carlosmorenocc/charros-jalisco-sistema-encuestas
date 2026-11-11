import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ArjonaRegistration, {
  ARJONA_EVENT_ID,
  ARJONA_REGISTRATION_DEADLINE_ISO
} from './ArjonaRegistration'
import { submitArjonaForm } from './submitArjonaForm'

vi.mock('./submitArjonaForm', () => ({ submitArjonaForm: vi.fn() }))

describe('ArjonaRegistration', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-12T18:00:00.000Z'))
    submitArjonaForm.mockResolvedValue({ ok: true, stored: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('conserva las preguntas históricas y registra la campaña independiente', async () => {
    render(<ArjonaRegistration />)

    expect(screen.getByRole('heading', {
      name: 'Participa por un pase doble para Ricardo Arjona'
    })).toBeInTheDocument()
    expect(screen.getByText(/viernes 13 de noviembre de 2026/i)).toHaveTextContent('9:00 a. m.')

    fireEvent.change(screen.getByLabelText(/Nombre completo/i), {
      target: { value: 'Ana López Pérez' }
    })
    expect(screen.getByLabelText(/Nombre completo/i)).toHaveValue('ANA LÓPEZ PÉREZ')
    fireEvent.change(screen.getByLabelText(/Qué recomendarías al Club Charros/i), {
      target: { value: 'Más actividades para las familias.' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Selecciona la rifa')

    fireEvent.click(screen.getByLabelText(/Ricardo Arjona/i))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByRole('heading', { name: 'Aviso de Privacidad' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enviar participación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Debes aceptar')
    fireEvent.click(screen.getByLabelText(/Acepto el Aviso de Privacidad/i))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar participación' }))

    await waitFor(() => expect(submitArjonaForm).toHaveBeenCalledOnce())
    expect(submitArjonaForm.mock.calls[0][0]).toMatchObject({
      campaignName: 'Club Charros · Pase doble Ricardo Arjona 2026',
      source: 'ricardo-arjona-2026',
      nombreCompleto: 'ANA LÓPEZ PÉREZ',
      eventoSeleccionado: ARJONA_EVENT_ID,
      recomendacion: 'Más actividades para las familias.',
      aceptaAvisoPrivacidad: true,
      privacyNoticeVersion: '2026-11-11'
    })
    expect(await screen.findByRole('heading', {
      name: '¡Tu participación fue registrada!'
    })).toBeInTheDocument()
  })

  it('muestra la convocatoria cerrada exactamente a partir de las 9:00 a. m.', () => {
    Date.now.mockReturnValue(Date.parse(ARJONA_REGISTRATION_DEADLINE_ISO))

    render(<ArjonaRegistration />)

    expect(screen.getByRole('heading', {
      name: 'La convocatoria para Ricardo Arjona ha finalizado'
    })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Nombre completo/i)).not.toBeInTheDocument()
  })

  it('cierra la interfaz si el servidor confirma que venció el plazo', async () => {
    submitArjonaForm.mockRejectedValue({ status: 410 })
    render(<ArjonaRegistration />)

    fireEvent.change(screen.getByLabelText(/Nombre completo/i), {
      target: { value: 'Ana López Pérez' }
    })
    fireEvent.click(screen.getByLabelText(/Ricardo Arjona/i))
    fireEvent.change(screen.getByLabelText(/Qué recomendarías al Club Charros/i), {
      target: { value: 'Más actividades para las familias.' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(await screen.findByLabelText(/Acepto el Aviso de Privacidad/i))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar participación' }))

    expect(await screen.findByRole('heading', {
      name: 'La convocatoria para Ricardo Arjona ha finalizado'
    })).toBeInTheDocument()
  })

  it('reutiliza el mismo identificador cuando se reintenta un envío', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    submitArjonaForm
      .mockRejectedValueOnce(new Error('Respuesta interrumpida'))
      .mockResolvedValueOnce({ ok: true, stored: false, duplicate: true })
    render(<ArjonaRegistration />)

    fireEvent.change(screen.getByLabelText(/Nombre completo/i), {
      target: { value: 'Ana López Pérez' }
    })
    fireEvent.click(screen.getByLabelText(/Ricardo Arjona/i))
    fireEvent.change(screen.getByLabelText(/Qué recomendarías al Club Charros/i), {
      target: { value: 'Más actividades para las familias.' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    const privacyConsent = await screen.findByLabelText(/Acepto el Aviso de Privacidad/i)
    expect(privacyConsent).toHaveAttribute('aria-required', 'true')
    fireEvent.click(privacyConsent)
    fireEvent.click(screen.getByRole('button', { name: 'Enviar participación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar')

    fireEvent.click(screen.getByRole('button', { name: 'Enviar participación' }))
    await waitFor(() => expect(submitArjonaForm).toHaveBeenCalledTimes(2))

    expect(submitArjonaForm.mock.calls[1][0].submissionId).toBe(
      submitArjonaForm.mock.calls[0][0].submissionId
    )
    expect(await screen.findByRole('heading', {
      name: '¡Tu participación fue registrada!'
    })).toBeInTheDocument()
  })
})
