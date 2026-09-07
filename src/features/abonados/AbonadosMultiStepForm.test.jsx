import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AbonadosMultiStepForm from './AbonadosMultiStepForm'
import { submitAbonadoForm } from './submitAbonadoForm'

vi.mock('./submitAbonadoForm', () => ({ submitAbonadoForm: vi.fn() }))

function fillContact() {
  fireEvent.change(screen.getByLabelText(/Nombre \*/i), { target: { value: '  María  ' } })
  fireEvent.change(screen.getByLabelText(/Apellido \*/i), { target: { value: '  López  ' } })
  fireEvent.change(screen.getByLabelText(/Correo electrónico/i), { target: { value: 'MARIA@EXAMPLE.COM ' } })
  fireEvent.change(screen.getByLabelText(/Número de teléfono/i), { target: { value: '3331234567' } })
}

function selectQuantity(quantity) {
  fireEvent.change(screen.getByLabelText(/Cuántos abonos tienes/i), { target: { value: String(quantity) } })
}

function fillUnit(position, { zone = 'VIP', size = 'M', text = 'Martinez', number = '22' } = {}) {
  fireEvent.change(screen.getByLabelText('Zona del abono *', { selector: `#abonado-zona-${position}` }), { target: { value: zone } })
  if (zone !== 'GENERAL') fireEvent.change(screen.getByLabelText(/talla te gustaría/i, { selector: `#abonado-talla-${position}` }), { target: { value: size } })
  fireEvent.change(screen.getByLabelText(/Texto \(1 a 10 letras\)/i, { selector: `#abonado-personalizacion-${position}` }), { target: { value: text } })
  fireEvent.change(screen.getByLabelText(/Número \(máximo 2 dígitos\)/i, { selector: `#abonado-numero-${position}` }), { target: { value: number } })
}

describe('AbonadosMultiStepForm', () => {
  beforeEach(() => vi.mocked(submitAbonadoForm).mockReset())

  it('despliega una tarjeta por cada abono y normaliza la personalización', () => {
    render(<AbonadosMultiStepForm />); selectQuantity(2)
    expect(screen.getByText('Abono 1')).toBeInTheDocument(); expect(screen.getByText('Abono 2')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'VIP' })).toBeInTheDocument()
    expect(screen.getByText('VIP Lateral')).toBeInTheDocument()
    expect(screen.getByText('Planta Baja Central')).toBeInTheDocument()
    expect(screen.getByText('Lateral Preferente 1ra–3ra')).toBeInTheDocument()
    expect(screen.getByText('Planta Alta')).toBeInTheDocument()
    fillUnit(1, { text: 'martinez123', number: '2x29' })
    expect(screen.getByLabelText(/Texto/i, { selector: '#abonado-personalizacion-1' })).toHaveValue('MARTINEZ')
    expect(screen.getByLabelText(/Número/i, { selector: '#abonado-numero-1' })).toHaveValue('22')
  })

  it('pide jersey sólo para VIP y Preferente, incluso en una compra mixta', () => {
    render(<AbonadosMultiStepForm />); selectQuantity(3)
    fireEvent.change(screen.getByLabelText('Zona del abono *', { selector: '#abonado-zona-1' }), { target: { value: 'VIP' } })
    fireEvent.change(screen.getByLabelText('Zona del abono *', { selector: '#abonado-zona-2' }), { target: { value: 'PREFERENTE' } })
    fireEvent.change(screen.getByLabelText('Zona del abono *', { selector: '#abonado-zona-3' }), { target: { value: 'GENERAL' } })
    expect(screen.getByLabelText(/primer jersey/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/segundo jersey/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/tercer jersey/i)).not.toBeInTheDocument()
  })

  it('no permite avanzar si falta una personalización válida', () => {
    render(<AbonadosMultiStepForm />); fillContact(); selectQuantity(1)
    fireEvent.change(screen.getByLabelText('Zona del abono *'), { target: { value: 'GENERAL' } })
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }))
    expect(screen.getByText('Ingresa entre 1 y 10 letras.')).toBeInTheDocument()
    expect(screen.getByText('Ingresa un número de 1 o 2 dígitos.')).toBeInTheDocument()
  })

  it('si ya está ligado omite ID y preferencia', () => {
    render(<AbonadosMultiStepForm />); fillContact(); selectQuantity(1); fillUnit(1, { zone: 'GENERAL' })
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }))
    fireEvent.click(screen.getByLabelText('Sí'))
    expect(screen.queryByLabelText(/Ingresa tu ID/i)).not.toBeInTheDocument()
  })

  it('si no está ligado exige ID y forma de entrega y muestra ayuda accesible', () => {
    render(<AbonadosMultiStepForm />); fillContact(); selectQuantity(1); fillUnit(1, { zone: 'GENERAL' })
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i })); fireEvent.click(screen.getByLabelText('No'))
    expect(screen.getByLabelText(/Ingresa tu ID/i)).toBeRequired()
    expect(screen.getByRole('button', { name: /Cómo encontrar mi ID/i })).toBeInTheDocument()
    expect(screen.getByAltText(/Ejemplo anónimo/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }))
    expect(screen.getByText('Ingresa un ID numérico válido.')).toBeInTheDocument()
    expect(screen.getByText('Selecciona cómo prefieres recibir tus boletos.')).toBeInTheDocument()
  })

  it('envía zona, personalización, jersey condicional y preferencia', async () => {
    vi.mocked(submitAbonadoForm).mockResolvedValueOnce({ ok: true })
    const onComplete = vi.fn()
    render(<AbonadosMultiStepForm onComplete={onComplete} />); fillContact(); selectQuantity(2)
    fillUnit(1, { zone: 'VIP', size: 'XL', text: 'Martinez', number: '22' })
    fillUnit(2, { zone: 'GENERAL', text: 'Lopez', number: '7' })
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i })); fireEvent.click(screen.getByLabelText('No'))
    fireEvent.change(screen.getByLabelText(/Ingresa tu ID/i), { target: { value: '486585' } })
    fireEvent.click(screen.getByLabelText('Aplicación BoletoMóvil'))
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i })); fireEvent.click(screen.getByLabelText(/He leído y acepto/i))
    fireEvent.click(screen.getByRole('button', { name: 'Terminar de registrarme' }))
    await waitFor(() => expect(submitAbonadoForm).toHaveBeenCalledWith(expect.objectContaining({
      cantidadAbonos: 2, boletoMovilLigado: 'NO', boletoMovilId: '486585', preferenciaEntrega: 'APP_BOLETOMOVIL',
      unidadesAbono: [
        { zona: 'VIP', tallaJersey: 'XL', personalizacionTexto: 'MARTINEZ', personalizacionNumero: '22' },
        { zona: 'GENERAL', tallaJersey: '', personalizacionTexto: 'LOPEZ', personalizacionNumero: '7' }
      ]
    })))
    expect(onComplete).toHaveBeenCalledOnce()
  })
})
