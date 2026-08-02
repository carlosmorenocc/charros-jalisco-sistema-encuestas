import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AbonadosMultiStepForm from './AbonadosMultiStepForm'
import { submitAbonadoForm } from './submitAbonadoForm'

vi.mock('./submitAbonadoForm', () => ({
  submitAbonadoForm: vi.fn()
}))

function fillPersonalDetails() {
  fireEvent.change(screen.getByLabelText(/Nombre \*/i), { target: { value: '  María  ' } })
  fireEvent.change(screen.getByLabelText(/Apellido \*/i), { target: { value: '  López  ' } })
  fireEvent.change(screen.getByLabelText(/Correo electrónico \*/i), { target: { value: 'MARIA@EXAMPLE.COM ' } })
  fireEvent.change(screen.getByLabelText(/Número de teléfono \*/i), { target: { value: '3331234567' } })
}

function selectJerseySizes(sizes) {
  fireEvent.change(screen.getByLabelText(/¿Cuántos abonos tienes\?/i), {
    target: { value: String(sizes.length) }
  })

  sizes.forEach((size, index) => {
    fireEvent.change(screen.getByLabelText(new RegExp(`talla de tu .* jersey`, 'i'), {
      selector: `#abonado-talla-${index + 1}`
    }), { target: { value: size } })
  })
}

function completeDetails({ sizes = ['XL'] } = {}) {
  fillPersonalDetails()
  selectJerseySizes(sizes)
}

describe('AbonadosMultiStepForm', () => {
  beforeEach(() => {
    vi.mocked(submitAbonadoForm).mockReset()
  })

  it('solicita la cantidad de abonos sin seleccionar un valor implícito', () => {
    render(<AbonadosMultiStepForm />)

    expect(
      screen.getByText(
        'Registra tus datos e indica la talla de jersey correspondiente a cada uno de tus abonos.'
      )
    ).toBeInTheDocument()
    const quantitySelect = screen.getByLabelText(/¿Cuántos abonos tienes\?/i)
    expect(quantitySelect).toHaveValue('')
    expect(Array.from(quantitySelect.options, (option) => option.value)).toEqual([
      '',
      ...Array.from({ length: 25 }, (_, index) => String(index + 1))
    ])
    expect(screen.queryByLabelText(/talla de tu .* jersey/i)).not.toBeInTheDocument()
  })

  it('exige la cantidad de abonos antes de avanzar', () => {
    render(<AbonadosMultiStepForm />)
    fillPersonalDetails()

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }))

    expect(screen.getByText('Selecciona cuántos abonos tienes.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Datos del abonado' })).toBeInTheDocument()
    expect(submitAbonadoForm).not.toHaveBeenCalled()
  })

  it('despliega una pregunta requerida por cada abono', () => {
    render(<AbonadosMultiStepForm />)

    fireEvent.change(screen.getByLabelText(/¿Cuántos abonos tienes\?/i), {
      target: { value: '2' }
    })

    expect(screen.getByLabelText(/talla de tu primer jersey/i)).toBeRequired()
    expect(screen.getByLabelText(/talla de tu segundo jersey/i)).toBeRequired()
    expect(screen.queryByLabelText(/talla de tu tercer jersey/i)).not.toBeInTheDocument()
  })

  it('identifica por ordinal la talla pendiente antes de avanzar', () => {
    render(<AbonadosMultiStepForm />)
    fillPersonalDetails()

    fireEvent.change(screen.getByLabelText(/¿Cuántos abonos tienes\?/i), {
      target: { value: '2' }
    })
    fireEvent.change(screen.getByLabelText(/talla de tu primer jersey/i), {
      target: { value: 'M' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }))

    expect(screen.getByText('Selecciona la talla de tu segundo jersey.')).toBeInTheDocument()
    expect(submitAbonadoForm).not.toHaveBeenCalled()
  })

  it('elimina las tallas sobrantes cuando disminuye la cantidad de abonos', () => {
    render(<AbonadosMultiStepForm />)

    selectJerseySizes(['S', 'M', 'L'])
    const quantitySelect = screen.getByLabelText(/¿Cuántos abonos tienes\?/i)

    fireEvent.change(quantitySelect, { target: { value: '1' } })
    expect(screen.getByLabelText(/talla de tu primer jersey/i)).toHaveValue('S')
    expect(screen.queryByLabelText(/talla de tu segundo jersey/i)).not.toBeInTheDocument()

    fireEvent.change(quantitySelect, { target: { value: '3' } })
    expect(screen.getByLabelText(/talla de tu primer jersey/i)).toHaveValue('S')
    expect(screen.getByLabelText(/talla de tu segundo jersey/i)).toHaveValue('')
    expect(screen.getByLabelText(/talla de tu tercer jersey/i)).toHaveValue('')
  })

  it('muestra correctamente la pregunta para el vigésimo quinto jersey', () => {
    render(<AbonadosMultiStepForm />)

    fireEvent.change(screen.getByLabelText(/¿Cuántos abonos tienes\?/i), {
      target: { value: '25' }
    })

    expect(screen.getByLabelText(/talla de tu vigésimo quinto jersey/i)).toBeInTheDocument()
    expect(screen.getAllByLabelText(/talla de tu .* jersey/i)).toHaveLength(25)
  })

  it('envía únicamente el payload acordado y muestra confirmación tras guardar', async () => {
    vi.mocked(submitAbonadoForm).mockResolvedValueOnce({ ok: true })
    render(<AbonadosMultiStepForm />)
    completeDetails({ sizes: ['XL', 'M'] })

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
        cantidadAbonos: 2,
        tallasJersey: ['XL', 'M'],
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

  it('describe un registro duplicado sin referirse a una sola talla', async () => {
    vi.mocked(submitAbonadoForm).mockRejectedValueOnce(Object.assign(new Error('HTTP 409'), { status: 409 }))
    render(<AbonadosMultiStepForm />)
    completeDetails({ sizes: ['S', 'L'] })

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }))
    fireEvent.click(screen.getByLabelText(/He leído y acepto/i))
    fireEvent.click(screen.getByRole('button', { name: 'Terminar de registrarme' }))

    expect(
      await screen.findByText('Este correo ya cuenta con un registro para la temporada LMP 2026-2027.')
    ).toBeInTheDocument()
    expect(screen.queryByText(/una talla registrada/i)).not.toBeInTheDocument()
  })

  it('ofrece únicamente las cinco tallas autorizadas en cada jersey', () => {
    render(<AbonadosMultiStepForm />)
    fireEvent.change(screen.getByLabelText(/¿Cuántos abonos tienes\?/i), {
      target: { value: '1' }
    })

    const sizeSelect = screen.getByLabelText(/talla de tu primer jersey/i)
    expect(Array.from(sizeSelect.options, (option) => option.value)).toEqual([
      '', 'S', 'M', 'L', 'XL', '2XL'
    ])
  })
})
