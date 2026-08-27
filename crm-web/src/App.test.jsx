import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App, { buildSaleItems, contactMatchesPatch, LoadingScreen, LoginScreen, revokeSessionSafely, salesForDashboard, updateContactWithVerification, verifyPersistedContactPatch } from './App'

describe('CRM web en modo demostración', () => {
  it('calcula 2x1 con precio oficial, unidades con cargo y bonificadas', () => {
    expect(buildSaleItems({ kind: 'new', zone: 'Lateral 1a-3a', quantity: 3, unitPrice: 7480, promotion2x1: true })).toEqual([
      { product: 'ABONO NUEVO · PROMOCIÓN 2X1 (CON CARGO)', zone: 'Lateral 1a-3a', quantity: 2, unitPrice: 7480 },
      { product: 'ABONO NUEVO · PROMOCIÓN 2X1 (BONIFICADO)', zone: 'Lateral 1a-3a', quantity: 1, unitPrice: 0 },
    ])
  })

  it('muestra la marca y el mensaje acordado durante la recarga', () => {
    render(<LoadingScreen />)
    expect(screen.getByRole('img', { name: 'Charros de Jalisco' })).toHaveAttribute('src', '/charros-logo.jpeg')
    expect(screen.getByRole('heading', { name: 'Cargando CRM…' })).toBeInTheDocument()
    expect(screen.getByText('Validando la sesión segura y actualizada.')).toBeInTheDocument()
  })

  it('calcula venta documentada con la misma fuente que Ventas e incluye apartados', () => {
    const sales = [
      { id: 'hugo', soldAt: '2026-08-23T12:00:00.000Z', owner: 'JESÚS GONZÁLEZ', total: 4207, commercialStatus: 'Apartada' },
      { id: 'diana', soldAt: '2026-07-22T12:00:00.000Z', owner: 'JESÚS GONZÁLEZ', total: 8415, commercialStatus: 'Confirmada' },
    ]
    const august = salesForDashboard(sales, { from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T23:59:59.999Z' })
    expect(august.map((sale) => sale.id)).toEqual(['hugo'])
    expect(august.reduce((sum, sale) => sum + sale.total, 0)).toBe(4207)
  })

  it('muestra el reporte sin la franja de modo demostración', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Reporte Dirección' })).toBeInTheDocument()
    expect(screen.queryByText(/Modo demostración/i)).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Descargar PDF' })).toBeInTheDocument()
  })

  it('integra la operación diaria dentro de Seguimiento', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Seguimiento/i }))
    expect(await screen.findByRole('heading', { name: 'Operación diaria' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Mis tareas/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Bitácora' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Vencidos y sin asignar/i })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Completar' })[0])
    expect(await screen.findByText(/La tarea se marcó como completada/i)).toBeInTheDocument()
  })

  it('registra una interacción desde el contacto con una acción real', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Cartera y Renovaciones/i }))
    expect(await screen.findByRole('columnheader', { name: 'Observaciones' })).toBeInTheDocument()
    const contactName = await screen.findByText('Mariana López')
    fireEvent.click(contactName.closest('button'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Registrar interacción', { selector: 'summary' }))
    fireEvent.change(screen.getByPlaceholderText(/Solicitó cotización/i), { target: { value: 'Solicitó información' } })
    fireEvent.change(screen.getByPlaceholderText(/Detalle verificable/i), { target: { value: 'Interacción sintética para validar el flujo.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar interacción' }))
    expect(await screen.findByText(/La interacción se registró correctamente/i)).toBeInTheDocument()
  })

  it('agrega la columna de abonos y edita sección y butacas desde la ficha', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Cartera y Renovaciones/i }))

    expect(await screen.findByRole('columnheader', { name: 'Abonos' })).toBeInTheDocument()
    expect(await screen.findByText('Preferente · 2 abonos')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Editar abonos de Mariana López' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/Sección/)).toHaveValue('Preferente')
    fireEvent.change(screen.getByLabelText(/Butaca 1/), { target: { value: 'P-A-99' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar abonos' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Guardar abonos' }))

    expect(await screen.findByText('Los abonos y butacas se actualizaron correctamente.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('P-A-99')).toBeInTheDocument()
  })

  it('permite iniciar una orden adicional sin reemplazar los abonos existentes', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Cartera y Renovaciones/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Editar abonos de Mariana López' }))

    expect(await screen.findByText('1 orden registrada para la temporada actual.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar otra orden' }))

    expect(screen.getByLabelText(/Orden de abonos/)).toHaveValue('new')
    expect(screen.getByLabelText(/Sección/)).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Agregar abonos' })).toBeDisabled()
    expect(screen.getByText('1 orden registrada para la temporada actual.')).toBeInTheDocument()
  })

  it('confirma una edición normal de contacto con el mensaje acordado', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Cartera y Renovaciones/i }))
    fireEvent.click((await screen.findByText('Mariana López')).closest('button'))
    fireEvent.change(await screen.findByLabelText(/Observación resumida/), { target: { value: 'Cambio sintético confirmado.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Se guardó satisfactoriamente.')).toBeInTheDocument()
  })

  it('retira la administración de usuarios del menú local', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /^Más/i }))
    expect(screen.queryByRole('menuitem', { name: /Usuarios|permisos/i })).not.toBeInTheDocument()
  })

  it('ofrece un login accesible de correo y contraseña sin persistir credenciales', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined)
    render(<LoginScreen onLogin={onLogin} notice="La sesión expiró." />)
    expect(screen.getByRole('heading', { name: 'CRM Abonados' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('La sesión expiró.')
    fireEvent.change(screen.getByLabelText('Correo corporativo'), { target: { value: 'ADMIN@CHARROSJALISCO.COM ' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'contraseña-de-prueba' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    expect(onLogin).toHaveBeenCalledWith({ email: 'admin@charrosjalisco.com', password: 'contraseña-de-prueba' })
  })

  it('conserva la sesión si logout falla y solo la limpia tras revocación o 401', async () => {
    const clearSession = vi.fn()
    await expect(revokeSessionSafely({ logout: vi.fn().mockRejectedValue(new Error('sin red')) }, clearSession)).rejects.toThrow('sin red')
    expect(clearSession).not.toHaveBeenCalled()

    await expect(revokeSessionSafely({ logout: vi.fn().mockResolvedValue(undefined) }, clearSession)).resolves.toBe(true)
    expect(clearSession).toHaveBeenLastCalledWith('signed-out')

    const unauthorized = Object.assign(new Error('expirada'), { status: 401 })
    await expect(revokeSessionSafely({ logout: vi.fn().mockRejectedValue(unauthorized) }, clearSession)).resolves.toBe(true)
    expect(clearSession).toHaveBeenLastCalledWith('unauthorized')
  })

  it('solo recupera un PATCH fallido cuando el GET confirma todos los campos enviados', async () => {
    const patch = { email: ' PERSONA@EXAMPLE.INVALID ', phone: '+52 33 1234 5678', summaryNotes: null }
    const persisted = { id: 'contact-1', email: 'persona@example.invalid', phone: '3312345678', summaryNotes: null }
    expect(contactMatchesPatch(persisted, patch)).toBe(true)
    expect(contactMatchesPatch({ ...persisted, phone: '3399999999' }, patch)).toBe(false)
    expect(contactMatchesPatch({ email: persisted.email, phone: persisted.phone }, patch)).toBe(false)

    await expect(verifyPersistedContactPatch({ contact: vi.fn().mockResolvedValue({ data: persisted }) }, 'contact-1', patch)).resolves.toEqual(persisted)
    await expect(verifyPersistedContactPatch({ contact: vi.fn().mockResolvedValue({ data: { ...persisted, email: 'otra@example.invalid' } }) }, 'contact-1', patch)).resolves.toBeNull()
    await expect(verifyPersistedContactPatch({ contact: vi.fn().mockRejectedValue(new Error('sin red')) }, 'contact-1', patch)).resolves.toBeNull()
  })

  it('hidrata por GET un PATCH 2xx con data null sin lanzar dentro del updater', async () => {
    const patch = { email: 'persona@example.invalid', summaryNotes: 'Confirmado' }
    const persisted = { id: 'contact-1', firstName: 'Persona', lastName: 'Ejemplo', subscriberStatus: 'renewing', commercialStage: 'follow_up', email: patch.email, summaryNotes: patch.summaryNotes }
    const api = { updateContact: vi.fn().mockResolvedValue({ data: null }), contact: vi.fn().mockResolvedValue({ data: persisted }) }

    await expect(updateContactWithVerification(api, 'contact-1', patch, 4)).resolves.toMatchObject({ id: 'contact-1', name: 'PERSONA EJEMPLO', note: 'Confirmado' })
    expect(api.contact).toHaveBeenCalledWith('contact-1')

    const mismatchApi = { updateContact: vi.fn().mockResolvedValue({ data: null }), contact: vi.fn().mockResolvedValue({ data: { ...persisted, summaryNotes: 'Otro' } }) }
    await expect(updateContactWithVerification(mismatchApi, 'contact-1', patch, 4)).rejects.toThrow(/no devolvió el contacto actualizado/i)
  })
})
