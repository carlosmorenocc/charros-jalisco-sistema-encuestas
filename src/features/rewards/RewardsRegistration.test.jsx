import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import RewardsRegistration from './RewardsRegistration'
import { submitRewardsForm } from './submitRewardsForm'

vi.mock('./submitRewardsForm', () => ({ submitRewardsForm: vi.fn() }))

describe('RewardsRegistration', () => {
  beforeEach(() => submitRewardsForm.mockResolvedValue({ ok: true }))
  afterEach(() => vi.clearAllMocks())

  it('normaliza el nombre, solicita recomendación y consentimiento antes de enviar', async () => {
    render(<RewardsRegistration />)

    const logo = screen.getByRole('link', { name: /canal de difusión/i })
    expect(logo).toHaveAttribute('href', 'https://whatsapp.com/channel/0029VbE1306LSmbVPqM1Ro02')

    fireEvent.change(screen.getByLabelText(/Nombre completo/i), { target: { value: 'Ana López Pérez' } })
    expect(screen.getByLabelText(/Nombre completo/i)).toHaveValue('ANA LÓPEZ PÉREZ')
    fireEvent.change(
      screen.getByLabelText(/Qué recomendarías al Club Charros/i),
      { target: { value: 'Más actividades familiares antes del juego.' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Selecciona al menos uno')
    fireEvent.click(screen.getByLabelText(/Papá sobre Ruedas Tour 2026/i))
    fireEvent.click(screen.getByLabelText(/Romeo Santos · Live México/i))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('heading', { name: 'Aviso de Privacidad' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar respuesta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Debes aceptar')

    fireEvent.click(screen.getByLabelText(/Acepto el Aviso de Privacidad/i))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar respuesta' }))

    await waitFor(() => expect(submitRewardsForm).toHaveBeenCalledOnce())
    expect(submitRewardsForm.mock.calls[0][0]).toMatchObject({
      nombreCompleto: 'ANA LÓPEZ PÉREZ',
      eventosSeleccionados: ['papa-sobre-ruedas-2026', 'romeo-santos-live-mexico-2026'],
      recomendacion: 'Más actividades familiares antes del juego.',
      aceptaAvisoPrivacidad: true
    })
    expect(await screen.findByRole('heading', { name: '¡Tu respuesta fue enviada!' })).toBeInTheDocument()
  })
})
