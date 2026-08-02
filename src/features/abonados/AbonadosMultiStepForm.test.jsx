import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AbonadosMultiStepForm from './AbonadosMultiStepForm'
import { submitAbonadoForm } from './submitAbonadoForm'

vi.mock('./submitAbonadoForm', () => ({
  submitAbonadoForm: vi.fn()
}))

function completeDetails({ selectSize = true } = {}) {
  fireEvent.change(screen.getByLabelText(/Nombre \*/i), { target: { value: '  María  ' } })
  fireEvent.change(screen.getByLabelText(/Apellido \*/i), { target: { value: '  López  ' } })
  fireEvent.change(screen.getByLabelText(/Correo electrónico \*/i), { target: { value: 'MARIA@EXAMPLE.COM ' } })
  fireEvent.change(screen.getByLabelText(/Número de teléfono \*/i), { target: { value: '3331234567' } })
  if (selectSize) {
    fireEvent.change(screen.getByLabelText(/talla de jersey/i), { target: { value: 'XL' } })
  }
}

describe('AbonadosMultiStepForm', () => {
  beforeEach(() => {
    vi.mocked(submitAbonadoForm).mockReset()
  })

  it('exige una talla de la lista antes de avanzar', async () => {
    render(<AbonadosMultiStepForm />)

    expect(
      screen.getByText('Registra tus datos y selecciona tu talla de preferencia.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Datos y talla')).not.toBeInTheDocument()

    completeDetails({ selectSize: false })

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }))

    expect(screen.getByText('Selecciona tu talla de jersey.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Datos del abonado' })).toBeInTheDocument()
    expect(submitAbonadoForm).not.toHaveBeenCalled()
  })

  it('envía únicamente el payload acordado y muestra confirmación tras guardar', async () => {
    vi.mocked(submitAbonadoForm).mockResolvedValueOnce({ ok: true })
    render(<AbonadosMultiStepForm />)
    completeDetails()

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }))
    fireEvent.click(screen.getByLabelText(/He leído y acepto/i))
    fireEvent.click(screen.getByLabelText(/Acepto recibir información/i))
    fireEvent.click(screen.getByRole('button', { name: 'Terminar de registrarme' }))

    await waitFor(() => {
      expect(submitAbonadoForm).toHaveBeenCalledWith({
        nombre: 'María',
        apellido: 'López',
        email: 'maria@example.com',
        telefono: '3331234567',
        tallaJersey: 'XL',
        aceptaAvisoPrivacidad: true,
        aceptaComunicaciones: true
      })
    })
    expect(
      await screen.findByRole('heading', { name: '¡Has completado tu registro exitosamente!' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Recibimos correctamente tus datos para la campaña de abonados LMP 2026-2027.')
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'En Club Charros nos emociona darte la bienvenida esta próxima temporada. Te esperamos en tu casa. #TodosSomosCharros'
      )
    ).toBeInTheDocument()
  })

  it('no muestra un éxito falso cuando el servidor rechaza el registro', async () => {
    vi.mocked(submitAbonadoForm).mockRejectedValueOnce(Object.assign(new Error('HTTP 500'), { status: 500 }))
    render(<AbonadosMultiStepForm />)
    completeDetails()

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }))
    fireEvent.click(screen.getByLabelText(/He leído y acepto/i))
    fireEvent.click(screen.getByRole('button', { name: 'Terminar de registrarme' }))

    expect(
      await screen.findByText('No pudimos guardar tu registro. Revisa tu conexión e intenta nuevamente.')
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '¡Has completado tu registro exitosamente!' })
    ).not.toBeInTheDocument()
  })

  it('ofrece únicamente las cinco tallas autorizadas', () => {
    render(<AbonadosMultiStepForm />)

    expect(
      screen.getAllByRole('option').map((option) => option.value)
    ).toEqual(['', 'S', 'M', 'L', 'XL', '2XL'])
  })
})
