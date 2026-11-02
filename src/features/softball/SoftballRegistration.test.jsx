import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import SoftballRegistration from './SoftballRegistration'
import { submitSoftballForm } from './submitSoftballForm'

vi.mock('./submitSoftballForm', () => ({ submitSoftballForm: vi.fn() }))

function completeRegistrationDetails(quantity = 1) {
  const names = ['Ana López Pérez', 'Brenda Ruiz Mora', 'Carlos Vega Solís', 'Diana Torres León']
  fireEvent.change(screen.getByLabelText(/Cuántos de tus abonos participan/i), {
    target: { value: String(quantity) }
  })
  screen.getAllByLabelText(/Nombre completo/i).forEach((input, index) => {
    fireEvent.change(input, { target: { value: names[index] || `Persona Afiliada Número ${index + 1}` } })
  })
  screen.getAllByLabelText(/Número de teléfono/i).forEach((input, index) => {
    fireEvent.change(input, { target: { value: `33123456${String(78 + index).padStart(2, '0')}` } })
  })
  fireEvent.click(screen.getByLabelText(/Juego de sóftbol para afiliados/i))
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
}

describe('SoftballRegistration', () => {
  let originalClipboard

  beforeEach(() => {
    submitSoftballForm.mockResolvedValue({ ok: true })
    originalClipboard = navigator.clipboard
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard
    })
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('captura varias personas en una operación y envía un arreglo de registros independientes', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })

    render(<SoftballRegistration />)

    expect(screen.getByRole('heading', { level: 1, name: '¡Regístrate para jugar sóftbol en el Estadio Panamericano!' })).toBeInTheDocument()
    expect(screen.getByText('Lugares limitados.')).toBeInTheDocument()
    expect(screen.getByText(/indica cuántos de tus abonos participan/i)).toBeInTheDocument()
    expect(screen.getByText(/registra a todas las personas en un solo envío/i)).toBeInTheDocument()
    expect(screen.getByText(/martes 3 de noviembre de 2026, hasta el final del día\./i)).toBeInTheDocument()
    expect(screen.queryByText(/avisos generales se compartirán en el canal de difusión de WhatsApp/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/te contactaremos personalmente por WhatsApp al número registrado/i)).not.toBeInTheDocument()
    expect(screen.getByText('Domingo 8 de noviembre de 2026 · 9:00 a.m.')).toBeInTheDocument()
    expect(screen.getByText(/Campo del Estadio Panamericano/i)).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(1)
    expect(screen.queryByText(/40 afiliados|40 lugares|cupo:\s*40/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/correo/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Comparte este registro' })).not.toBeInTheDocument()

    const seasonTicketQuantity = screen.getByLabelText(/Cuántos de tus abonos participan/i)
    expect(seasonTicketQuantity).toHaveValue('')
    fireEvent.change(seasonTicketQuantity, { target: { value: '3' } })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Captura los datos de las 3 personas participantes. Al enviar, cada persona se guardará como un registro individual.'
    )
    expect(screen.getAllByRole('group', { name: /Participante/i })).toHaveLength(3)
    expect(screen.getAllByLabelText(/Nombre completo/i)).toHaveLength(3)
    expect(screen.getAllByLabelText(/Número de teléfono/i)).toHaveLength(3)

    fireEvent.change(screen.getAllByLabelText(/Nombre completo/i)[0], { target: { value: 'Ana López Pérez' } })
    expect(screen.getAllByLabelText(/Nombre completo/i)[0]).toHaveValue('ANA LÓPEZ PÉREZ')
    fireEvent.change(screen.getAllByLabelText(/Número de teléfono/i)[0], { target: { value: '33 1234 5678' } })

    fireEvent.change(seasonTicketQuantity, { target: { value: '1' } })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Captura los datos de la persona participante. Al enviar, se generará 1 registro individual.'
    )
    expect(screen.getByLabelText(/Nombre completo/i)).toHaveValue('ANA LÓPEZ PÉREZ')
    fireEvent.change(seasonTicketQuantity, { target: { value: '3' } })
    expect(screen.getAllByLabelText(/Nombre completo/i)[0]).toHaveValue('ANA LÓPEZ PÉREZ')

    fireEvent.change(screen.getAllByLabelText(/Número de teléfono/i)[0], { target: { value: '123' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Continuar' }).closest('form'))
    expect(await screen.findByRole('alert')).toHaveTextContent('10 dígitos para la persona 1')

    fireEvent.change(screen.getAllByLabelText(/Número de teléfono/i)[0], { target: { value: '33ABC12345678' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Continuar' }).closest('form'))
    expect(await screen.findByRole('alert')).toHaveTextContent('10 dígitos para la persona 1')

    fireEvent.change(screen.getAllByLabelText(/Número de teléfono/i)[0], { target: { value: '33 1234 5678' } })
    fireEvent.change(screen.getAllByLabelText(/Nombre completo/i)[1], { target: { value: 'Brenda Ruiz Mora' } })
    fireEvent.change(screen.getAllByLabelText(/Número de teléfono/i)[1], { target: { value: '3312345679' } })
    fireEvent.change(screen.getAllByLabelText(/Nombre completo/i)[2], { target: { value: 'Carlos Vega Solís' } })
    fireEvent.change(screen.getAllByLabelText(/Número de teléfono/i)[2], { target: { value: '3312345680' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Selecciona el juego de sóftbol')

    fireEvent.click(screen.getByLabelText(/Juego de sóftbol para afiliados/i))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('heading', { name: 'Aviso de Privacidad' })).toBeInTheDocument()
    expect(screen.getByText(/tengo autorización de las personas registradas para proporcionar sus datos/i)).toBeInTheDocument()
    expect(screen.getByText((_, element) => (
      element?.tagName === 'P'
      && element.textContent.includes('Enviarás 3 registros individuales')
    ))).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Comparte este registro' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar registro' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Debes aceptar')

    fireEvent.click(screen.getByLabelText(/Acepto el Aviso de Privacidad/i))
    fireEvent.click(screen.getByLabelText(/Acepto recibir información/i))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar registro' }))

    await waitFor(() => expect(submitSoftballForm).toHaveBeenCalledOnce())
    expect(submitSoftballForm.mock.calls[0][0]).toMatchObject({
      campaignName: 'Club Charros · Juego de sóftbol para afiliados',
      source: 'club-charros-softball-affiliates',
      nombreCompleto: 'ANA LÓPEZ PÉREZ',
      telefono: '33 1234 5678',
      cantidadAbonos: 3,
      participantes: [
        { nombreCompleto: 'ANA LÓPEZ PÉREZ', telefono: '33 1234 5678' },
        { nombreCompleto: 'BRENDA RUIZ MORA', telefono: '3312345679' },
        { nombreCompleto: 'CARLOS VEGA SOLÍS', telefono: '3312345680' }
      ],
      eventoSeleccionado: 'softbol-club-charros-2026-11-08',
      aceptaAvisoPrivacidad: true,
      aceptaComunicaciones: true
    })
    expect(await screen.findByRole('heading', { name: '¡Las participaciones fueron registradas!' })).toBeInTheDocument()
    expect(screen.getByText(/Guardamos 3 registros individuales/i)).toBeInTheDocument()
    const shareRegion = screen.getByRole('region', { name: 'Comparte este registro' })
    expect(shareRegion).toBeInTheDocument()

    const shareLink = within(shareRegion).getByRole('link', { name: /softbol-afiliados/i })
    expect(shareLink).toHaveAttribute('href', 'http://localhost:3000/softbol-afiliados')
    fireEvent.click(within(shareRegion).getByRole('button', { name: 'Copiar liga' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://localhost:3000/softbol-afiliados'))
    expect(await within(shareRegion).findByText(/Liga copiada/i)).toBeInTheDocument()
  })

  it('explica el límite de una persona cuando el backend responde 409', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const duplicateError = Object.assign(new Error('duplicate'), { status: 409 })
    submitSoftballForm.mockRejectedValueOnce(duplicateError)
    render(<SoftballRegistration />)

    completeRegistrationDetails()
    expect(await screen.findByRole('heading', { name: 'Aviso de Privacidad' })).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/Acepto el Aviso de Privacidad/i))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar registro' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Una o más personas ya están registradas')
    expect(screen.queryByRole('heading', { name: /participaci(?:ón|ones) fue(?:ron)? registrada/i })).not.toBeInTheDocument()
  })

  it('acepta +52, enfoca cada paso y limpia consentimientos al regresar', async () => {
    render(<SoftballRegistration />)
    const firstHeading = screen.getByRole('heading', { name: /Regístrate para jugar sóftbol/i })
    await waitFor(() => expect(firstHeading).toHaveFocus())

    fireEvent.change(screen.getByLabelText(/Cuántos de tus abonos participan/i), {
      target: { value: '1' }
    })
    fireEvent.change(screen.getByLabelText(/Nombre completo/i), {
      target: { value: 'Persona Afiliada Prueba' }
    })
    fireEvent.change(screen.getByLabelText(/Número de teléfono/i), {
      target: { value: '+52 33 1234 5678' }
    })
    fireEvent.click(screen.getByLabelText(/Juego de sóftbol para afiliados/i))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    const privacyHeading = await screen.findByRole('heading', { name: 'Aviso de Privacidad' })
    await waitFor(() => expect(privacyHeading).toHaveFocus())
    const privacy = screen.getByLabelText(/Acepto el Aviso de Privacidad/i)
    const communications = screen.getByLabelText(/Acepto recibir información/i)
    fireEvent.click(privacy)
    fireEvent.click(communications)
    expect(privacy).toBeChecked()
    expect(communications).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    const returnedHeading = await screen.findByRole('heading', { name: /Regístrate para jugar sóftbol/i })
    await waitFor(() => expect(returnedHeading).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByLabelText(/Acepto el Aviso de Privacidad/i)).not.toBeChecked()
    expect(screen.getByLabelText(/Acepto recibir información/i)).not.toBeChecked()
  })

  it('requiere indicar la cantidad de abonos antes de continuar', async () => {
    render(<SoftballRegistration />)
    fireEvent.click(screen.getByLabelText(/Juego de sóftbol para afiliados/i))

    fireEvent.submit(screen.getByRole('button', { name: 'Continuar' }).closest('form'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Selecciona cuántos de tus abonos participan')
    expect(screen.queryByRole('heading', { name: 'Aviso de Privacidad' })).not.toBeInTheDocument()
  })

  it('rechaza nombres con caracteres ajenos a un nombre', async () => {
    render(<SoftballRegistration />)
    fireEvent.change(screen.getByLabelText(/Cuántos de tus abonos participan/i), {
      target: { value: '1' }
    })
    fireEvent.change(screen.getByLabelText(/Nombre completo/i), {
      target: { value: 'ANA PÉREZ 123' }
    })
    fireEvent.change(screen.getByLabelText(/Número de teléfono/i), {
      target: { value: '3312345678' }
    })
    fireEvent.click(screen.getByLabelText(/Juego de sóftbol para afiliados/i))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe el nombre completo de la persona 1')
    expect(screen.queryByRole('heading', { name: 'Aviso de Privacidad' })).not.toBeInTheDocument()
  })

  it.each([
    [400, 'Revisa la cantidad de abonos, los datos de cada participante y el evento seleccionado'],
    [410, 'cerró al finalizar el martes 3 de noviembre'],
    [429, 'muchos registros al mismo tiempo'],
    [503, 'temporalmente pausado'],
    [500, 'en unos momentos']
  ])('presenta un mensaje coherente para el estado HTTP %s', async (status, message) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    submitSoftballForm.mockRejectedValueOnce(Object.assign(new Error('request failed'), { status }))
    render(<SoftballRegistration />)
    completeRegistrationDetails()
    fireEvent.click(await screen.findByLabelText(/Acepto el Aviso de Privacidad/i))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar registro' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('distingue una falla de conexión de una respuesta HTTP', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    submitSoftballForm.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<SoftballRegistration />)
    completeRegistrationDetails()
    fireEvent.click(await screen.findByLabelText(/Acepto el Aviso de Privacidad/i))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar registro' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa tu conexión')
  })

  it('reutiliza el mismo submissionId cuando se reintenta un envío', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    submitSoftballForm
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true })

    render(<SoftballRegistration />)
    completeRegistrationDetails(2)
    fireEvent.click(await screen.findByLabelText(/Acepto el Aviso de Privacidad/i))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar registro' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa tu conexión')

    fireEvent.click(screen.getByRole('button', { name: 'Enviar registro' }))
    await waitFor(() => expect(submitSoftballForm).toHaveBeenCalledTimes(2))
    expect(submitSoftballForm.mock.calls[1][0].submissionId).toBe(
      submitSoftballForm.mock.calls[0][0].submissionId
    )
    expect(await screen.findByRole('heading', { name: '¡Las participaciones fueron registradas!' })).toBeInTheDocument()
  })
})
